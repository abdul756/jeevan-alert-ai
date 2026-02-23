import logging
from typing import Dict, Any

from ..domain.state import ToolBasedWorkflowState
from ..domain.tools import BaseClinicalTool

logger = logging.getLogger(__name__)

def create_node_executor(tool: BaseClinicalTool):
    """
    Creates a LangGraph-compatible node execution function for any given Tool.
    """
    def execute_node(state: ToolBasedWorkflowState) -> Dict[str, Any]:
        # Lazy load toolkit to avoid circular imports
        from ...core.medgemma_tools import get_medgemma_toolkit
        toolkit = get_medgemma_toolkit()
        return tool.execute(state, toolkit)
    
    execute_node.__name__ = f"execute_{tool.name}"
    return execute_node

def emergency_confirmation_gate(state: ToolBasedWorkflowState) -> Dict[str, Any]:
    """
    Human-in-the-loop gate before emergency protocol.

    This node is placed before emergency_protocol with an interrupt.
    When the workflow reaches this point, it pauses and returns the current
    state to the CHW for confirmation before proceeding.
    """
    logger.warning("HUMAN-IN-THE-LOOP: Emergency detected — awaiting CHW confirmation")
    return {
        "messages": [
            "EMERGENCY DETECTED: Workflow paused for CHW confirmation. "
            f"Triage level: {state.get('triage_level', 'EMERGENCY')}. "
            f"Red flags: {state.get('red_flags', [])}. "
            "Please confirm to proceed with emergency protocol."
        ],
        "awaiting_confirmation": True,
        "current_step": "emergency_confirmation",
    }
