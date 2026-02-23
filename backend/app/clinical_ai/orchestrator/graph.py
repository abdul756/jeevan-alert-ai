import logging
import asyncio
import sqlite3
from typing import Dict, Any, Optional

from langgraph.graph import StateGraph, END
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain.state import ToolBasedWorkflowState
from .agent import orchestrator_agent
from ..domain.registry import registry
from .executor import create_node_executor, emergency_confirmation_gate

# Import medgemma_adapters to trigger tool registration
import app.clinical_ai.tools.medgemma_adapters
from ...models.encounter import Encounter
from ...models.patient import Patient
from ...models.observation import Observation

try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    _sqlite_conn = sqlite3.connect("workflow_checkpoints.db", check_same_thread=False)
    _checkpointer_backend = SqliteSaver(_sqlite_conn)
    logger_tmp = logging.getLogger(__name__)
    logger_tmp.info("Checkpointer: SqliteSaver (persistent across restarts)")
except Exception as _e:
    from langgraph.checkpoint.memory import MemorySaver
    _checkpointer_backend = MemorySaver()
    logger_tmp = logging.getLogger(__name__)
    logger_tmp.warning(f"SqliteSaver unavailable ({_e}), falling back to MemorySaver")

logger = logging.getLogger(__name__)

def route_next_action(state: ToolBasedWorkflowState) -> str:
    """Route from orchestrator to the appropriate tool node."""
    action = state.get("next_action", "end")
    logger.info(f"Routing to: {action}")
    return action


# ============================================================================
# Workflow Graph Construction
# ============================================================================

# Global shared checkpointer for workflow resumption
# IMPORTANT: Must be shared across all workflow instances to enable resumption
_global_checkpointer = _checkpointer_backend

def create_tool_based_workflow(use_checkpointer: bool = True) -> StateGraph:
    """
    Create LangGraph StateGraph for tool-based clinical workflow.

    Features:
    - MedGemma-powered orchestrator reasoning
    - 7 specialized medical tools (6 text via medgemma-chw + 1 vision via isic-medgemma)
    - Parallel execution for risk + referral
    - Human-in-the-loop interrupt before emergency protocol
    - Error recovery with safe fallbacks
    - Optional checkpointing for workflow resumption

    Returns:
        Compiled StateGraph workflow
    """
    logger.info("Building tool-based clinical workflow graph")

    workflow = StateGraph(ToolBasedWorkflowState)

    # ── Add nodes ──
    workflow.add_node("orchestrator", orchestrator_agent)
    workflow.add_node("emergency_confirmation", emergency_confirmation_gate)

    tools = registry.get_all_tools()
    for tool in tools:
        workflow.add_node(tool.name, create_node_executor(tool))
        workflow.add_edge(tool.name, "orchestrator")

    workflow.set_entry_point("orchestrator")

    edges = {t.name: t.name for t in tools}
    edges["end"] = END
    # Hijack emergency_protocol to go through Human-in-the-loop gate
    if "emergency_protocol" in edges:
        edges["emergency_protocol"] = "emergency_confirmation"
        workflow.add_edge("emergency_confirmation", "emergency_protocol")

    workflow.add_conditional_edges("orchestrator", route_next_action, edges)

    # ── Compile with checkpointing and human-in-the-loop ──
    compile_kwargs = {}
    if use_checkpointer:
        # Use global shared checkpointer to enable workflow resumption
        compile_kwargs["checkpointer"] = _global_checkpointer
        compile_kwargs["interrupt_before"] = ["emergency_protocol"]

    compiled = workflow.compile(**compile_kwargs)

    logger.info("Tool-based workflow graph compiled successfully")
    logger.info("  Nodes: orchestrator + 9 tool nodes (6 text + 1 vision + parallel + HiL gate)")
    logger.info("  Features: MedGemma reasoning, parallel execution, HiL interrupt, error recovery")
    return compiled


# ============================================================================
# Workflow Execution
# ============================================================================

async def execute_tool_based_workflow(
    encounter_id: str,
    db: AsyncSession,
    image_path: Optional[str] = None,
    image_type: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute tool-based clinical workflow for an encounter.

    Args:
        encounter_id: Encounter UUID
        db: AsyncSession for database operations
        image_path: Optional path to medical image for vision analysis
        image_type: Optional type of image ("skin", "xray", "general")
        thread_id: Optional thread ID for workflow resumption

    Returns:
        Final workflow state (compatible with frontend expectations)
    """
    logger.info("=" * 70)
    logger.info(f"STARTING TOOL-BASED WORKFLOW: {encounter_id}")
    logger.info("=" * 70)

    try:
        # Load encounter data (async)
        result = await db.execute(select(Encounter).filter(Encounter.id == encounter_id))
        encounter = result.scalar_one_or_none()
        if not encounter:
            raise ValueError(f"Encounter {encounter_id} not found")

        # Load patient data (async)
        result = await db.execute(select(Patient).filter(Patient.id == encounter.patient_id))
        patient = result.scalar_one_or_none()
        if not patient:
            raise ValueError(f"Patient {encounter.patient_id} not found")

        # Get observations (vitals) - async
        result = await db.execute(
            select(Observation).filter(Observation.encounter_id == encounter_id)
        )
        observations = result.scalars().all()

        vitals = {}
        for obs in observations:
            vitals[obs.observation_type] = {
                "value": obs.value,
                "unit": obs.unit,
            }

        # Build initial state
        initial_state = {
            "encounter_id": encounter_id,
            "patient_id": str(patient.id),
            "patient_context": f"Age: {patient.age or 'Unknown'}, Gender: {patient.gender}, Name: {patient.name}",
            "symptoms": encounter.chief_complaint or "Not specified",
            "vitals": vitals,
            "medical_history": patient.medical_history,
            "image_path": image_path,
            "image_type": image_type,
            "messages": [],
            "tool_calls": [],
            "orchestrator_reasoning": [],
            "next_action": "start",
            "workflow_complete": False,
            "is_emergency": False,
            "needs_referral": False,
            "awaiting_confirmation": False,
            "agent_history": [],
            "current_step": "initializing",
        }

        # Create and run workflow
        workflow = create_tool_based_workflow(use_checkpointer=True)

        config = {"configurable": {"thread_id": thread_id or encounter_id}}
        final_state = await asyncio.to_thread(workflow.invoke, initial_state, config)

        # Build agent_history from tool_calls for backward compatibility
        tool_names = [call["tool_name"] for call in final_state.get("tool_calls", [])]
        final_state["agent_history"] = tool_names

        # Add follow_up_plan
        if final_state.get("needs_referral"):
            final_state["follow_up_plan"] = "Follow up after specialist consultation"
        else:
            final_state["follow_up_plan"] = "Follow up in 1-2 weeks or if symptoms worsen"

        logger.info("=" * 70)
        logger.info(f"WORKFLOW COMPLETE: {len(tool_names)} tools called")
        logger.info(f"Orchestrator reasoning trace: {final_state.get('orchestrator_reasoning', [])}")
        logger.info("=" * 70)

        return final_state

    except Exception as e:
        logger.error(f"Workflow execution failed: {e}")
        raise
