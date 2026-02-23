"""
Tool-Based Clinical Workflow API.
Uses MedGemma as specialized medical tools with orchestrator agent.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Literal
import logging
import json
import asyncio
import queue as stdlib_queue
import uuid
from datetime import datetime

from ...core.database import get_db
from ...core.medgemma_tools import get_medgemma_toolkit
from ...models.encounter import Encounter

# Tool-based workflow with MedGemma-powered orchestrator
# See tool_based_workflow.py for architecture details

logger = logging.getLogger(__name__)
router = APIRouter()


class WorkflowRequest(BaseModel):
    encounter_id: str
    image_path: str | None = None
    image_type: str | None = None  # "skin", "xray", "general"


class WorkflowResumptionRequest(BaseModel):
    """Request to resume an interrupted workflow with CHW decision."""
    encounter_id: str
    thread_id: str  # Thread ID from the interrupt response
    decision: Literal["approve", "reject"]  # CHW's decision
    chw_notes: str  # Required clinical documentation



@router.get("/workflow-status/{encounter_id}")
async def get_workflow_status(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get workflow status for an encounter."""
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()
    
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found")
    
    return {
        "encounter_id": encounter_id,
        "status": encounter.status,
        "triage_level": encounter.triage_level,
        "has_soap_note": bool(encounter.soap_note)
    }


@router.get("/model-status")
async def get_model_status():
    """Check if the AI model is loaded and ready."""
    toolkit = get_medgemma_toolkit()
    info = toolkit.get_model_info()
    
    return {
        "model_ready": info["status"] == "loaded",
        "model_name": info.get("model"),
        "backend": info["backend"],
        "tools_count": 7
    }


@router.post("/reinitialize-model")
async def reinitialize_model():
    """
    Reinitialize the AI model.
    Useful if Ollama wasn't running when the server started.
    """
    toolkit = get_medgemma_toolkit()
    success = toolkit.reinitialize()
    info = toolkit.get_model_info()

    return {
        "success": success,
        "model_ready": info["status"] == "loaded",
        "model_name": info.get("model"),
        "message": "Model reinitialized successfully" if success else "Failed to reinitialize model - check if Ollama is running"
    }


@router.get("/stream-workflow/{encounter_id}")
async def stream_workflow_progress(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    SSE endpoint: streams real-time tool progress while executing the clinical workflow.

    Frontend connects here with EventSource / fetch-streaming.
    Events:
      {"type": "step_start",    "tool": "...", "label": "...", "description": "..."}
      {"type": "step_complete", "tool": "...", "label": "...", ...tool-specific fields}
      {"type": "orchestrator",  "reasoning": "...", "next_action": "..."}
      {"type": "complete",      "data": { ...final_state } }
      {"type": "interrupt",     "data": { ...awaiting_confirmation context } }
      {"type": "error",         "message": "..."}
    """
    from ..orchestrator.graph import execute_tool_based_workflow
    from ..orchestrator.progress import _progress_queues

    async def event_generator():
        # Set up progress queue BEFORE starting workflow
        progress_q: stdlib_queue.SimpleQueue = stdlib_queue.SimpleQueue()
        _progress_queues[encounter_id] = progress_q

        # Generate a unique thread_id per run so re-running always starts fresh
        # (LangGraph checkpointer would resume a completed thread if we reused encounter_id)
        run_thread_id = f"{encounter_id}-{uuid.uuid4().hex[:8]}"

        try:
            # Fetch encounter
            result = await db.execute(select(Encounter).where(Encounter.id == encounter_id))
            encounter = result.scalar_one_or_none()
            if not encounter:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Encounter not found'})}\n\n"
                return

            image_path = encounter.image_path
            image_type = encounter.image_type

            # Mark as in-progress
            encounter.status = "in-progress"
            encounter.started_at = datetime.now()
            await db.commit()

            # SSE comment — forces uvicorn/browser to flush the connection immediately
            yield ": ping\n\n"

            # Emit workflow start event
            yield f"data: {json.dumps({'type': 'workflow_start', 'has_image': bool(image_path)})}\n\n"

            # Run workflow as a background task (releases event loop via asyncio.to_thread internally)
            workflow_task = asyncio.create_task(
                execute_tool_based_workflow(
                    encounter_id=encounter_id,
                    db=db,
                    image_path=image_path,
                    image_type=image_type,
                    thread_id=run_thread_id,
                )
            )

            # Poll queue while workflow runs in thread
            while not workflow_task.done():
                # Drain all queued events
                while True:
                    try:
                        event = progress_q.get_nowait()
                        yield f"data: {json.dumps(event)}\n\n"
                    except stdlib_queue.Empty:
                        break
                await asyncio.sleep(0.05)  # 50ms poll — fast enough for smooth UX

            # Drain any remaining events after task finishes
            while True:
                try:
                    event = progress_q.get_nowait()
                    yield f"data: {json.dumps(event)}\n\n"
                except stdlib_queue.Empty:
                    break

            # Get workflow result
            final_state = await workflow_task

            # Handle human-in-the-loop interrupt
            if final_state.get("awaiting_confirmation") and not final_state.get("workflow_complete"):
                yield f"data: {json.dumps({'type': 'interrupt', 'data': {'triage_level': final_state.get('triage_level'), 'red_flags': final_state.get('red_flags', []), 'assessment_summary': final_state.get('assessment_summary'), 'differential_diagnoses': final_state.get('differential_diagnoses', []), 'thread_id': run_thread_id}})}\n\n"
                return

            # Persist results to DB
            result = await db.execute(select(Encounter).where(Encounter.id == encounter_id))
            encounter = result.scalar_one_or_none()
            if encounter:
                encounter.status = "completed"
                encounter.completed_at = datetime.now()
                if final_state.get("triage_level"):
                    encounter.triage_level = final_state["triage_level"]
                if final_state.get("assessment_summary"):
                    encounter.assessment_summary = final_state["assessment_summary"]
                if final_state.get("soap_note"):
                    encounter.soap_note = json.dumps(final_state["soap_note"])

                treatment_plan = final_state.get("treatment_plan", {})
                clinical_assessment = final_state.get("clinical_assessment", {})
                soap_note_data = final_state.get("soap_note")
                if isinstance(soap_note_data, str):
                    try:
                        soap_note_data = json.loads(soap_note_data)
                    except json.JSONDecodeError:
                        soap_note_data = {}

                encounter.ai_assessment_data = {
                    "triage_level": final_state.get("triage_level"),
                    "red_flags": final_state.get("red_flags", []),
                    "differential_diagnoses": final_state.get("differential_diagnoses", []),
                    "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                    "risk_level": final_state.get("risk_level"),
                    "risk_recommendations": final_state.get("risk_recommendations", []),
                    "referral_needed": final_state.get("referral_needed", False),
                    "referral_type": final_state.get("referral_type"),
                    "referral_urgency": final_state.get("referral_urgency"),
                    "medications": treatment_plan.get("medications", []),
                    "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                    "soap_note": soap_note_data,
                    "assessment_summary": final_state.get("assessment_summary"),
                    "follow_up_plan": final_state.get("follow_up_plan"),
                    "is_emergency": final_state.get("is_emergency", False),
                    "emergency_guidance": final_state.get("emergency_guidance"),
                }
                await db.commit()

            # Build frontend-compatible final state (same shape as POST endpoint)
            soap_note = final_state.get("soap_note")
            if isinstance(soap_note, str):
                try:
                    soap_note = json.loads(soap_note)
                except json.JSONDecodeError:
                    soap_note = {}

            treatment_plan = final_state.get("treatment_plan", {})
            clinical_assessment = final_state.get("clinical_assessment", {})

            payload = {
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "assessment_summary": final_state.get("assessment_summary"),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "primary_diagnosis": (final_state.get("differential_diagnoses") or ["Unknown"])[0],
                "diagnostic_reasoning": final_state.get("assessment_summary", ""),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "medications": treatment_plan.get("medications", []),
                "medication_education": final_state.get("medication_education"),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "interventions": final_state.get("interventions", []),
                "patient_education": final_state.get("patient_education"),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "soap_note": soap_note,
                "follow_up_plan": final_state.get("follow_up_plan"),
                "agent_history": final_state.get("agent_history", []),
                "current_step": final_state.get("current_step"),
                "workflow_complete": final_state.get("workflow_complete", False),
                "tool_calls": final_state.get("tool_calls", []),
                "orchestrator_reasoning": final_state.get("orchestrator_reasoning", []),
                "workflow_trace": {
                    "tools_used": [c["tool_name"] for c in final_state.get("tool_calls", [])],
                    "total_tools": len(final_state.get("tool_calls", [])),
                    "reasoning_trace": final_state.get("orchestrator_reasoning", []),
                },
                "skin_cancer_result": final_state.get("skin_cancer_result"),
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
            }

            yield f"data: {json.dumps({'type': 'complete', 'data': payload})}\n\n"

        except Exception as e:
            logger.error(f"SSE workflow stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            _progress_queues.pop(encounter_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for SSE
            "Connection": "keep-alive",
        },
    )


@router.post("/execute-tool-workflow")
async def execute_tool_workflow(
    request: WorkflowRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute tool-based clinical workflow (MedGemma as tools architecture).

    This endpoint uses the new orchestrator-driven workflow where MedGemma
    is exposed as specialized medical tools rather than as individual agents.

    Benefits:
    - Clear separation: Orchestrator reasons, MedGemma provides medical expertise
    - Better error handling: Orchestrator can retry failed tools
    - Modularity: Easy to add/remove tools
    - Qualifies for Kaggle "Agentic Workflow" prize category

    API is backward-compatible with existing frontend.
    """
    from ..orchestrator.graph import execute_tool_based_workflow

    logger.info(f"Tool-based workflow requested for encounter: {request.encounter_id}")

    try:
        # Fetch encounter to get image path if not provided in request
        result = await db.execute(
            select(Encounter).where(Encounter.id == request.encounter_id)
        )
        encounter = result.scalar_one_or_none()

        if not encounter:
            raise HTTPException(status_code=404, detail="Encounter not found")

        # Use image from encounter if not provided in request
        image_path = request.image_path or encounter.image_path
        image_type = request.image_type or encounter.image_type

        # Update encounter status to in-progress
        encounter.status = "in-progress"
        encounter.started_at = datetime.now()
        await db.commit()
        await db.refresh(encounter)

        # Execute workflow (async with database session)
        final_state = await execute_tool_based_workflow(
            encounter_id=request.encounter_id,
            db=db,
            image_path=image_path,
            image_type=image_type,
        )

        # Check for workflow interrupt (human-in-the-loop confirmation needed)
        if final_state.get("awaiting_confirmation") and not final_state.get("workflow_complete"):
            logger.info("Workflow interrupted - awaiting CHW emergency confirmation")

            # Return interrupt response to frontend
            return {
                "success": True,
                "status": "awaiting_confirmation",
                "interrupt_reason": "emergency_protocol",
                "encounter_id": request.encounter_id,
                "thread_id": request.encounter_id,  # Thread ID for resumption
                "message": "Emergency detected. CHW confirmation required before activating protocol.",
                "confirmation_context": {
                    "triage_level": final_state.get("triage_level"),
                    "red_flags": final_state.get("red_flags", []),
                    "assessment_summary": final_state.get("assessment_summary"),
                    "differential_diagnoses": final_state.get("differential_diagnoses", []),
                },
                "partial_state": final_state,  # Progress made so far
            }

        # Update database with results
        # Refetch encounter in case workflow modified it
        result = await db.execute(
            select(Encounter).where(Encounter.id == request.encounter_id)
        )
        encounter = result.scalar_one_or_none()

        if encounter:
            # Update encounter status to completed
            encounter.status = "completed"
            encounter.completed_at = datetime.now()

            if final_state.get("triage_level"):
                encounter.triage_level = final_state["triage_level"]
            if final_state.get("assessment_summary"):
                encounter.assessment_summary = final_state["assessment_summary"]
            if final_state.get("soap_note"):
                import json
                encounter.soap_note = json.dumps(final_state["soap_note"])

            # Save full AI assessment results for persistence across page loads
            import json
            treatment_plan = final_state.get("treatment_plan", {})
            clinical_assessment = final_state.get("clinical_assessment", {})
            soap_note_data = final_state.get("soap_note")
            if isinstance(soap_note_data, str):
                try:
                    soap_note_data = json.loads(soap_note_data)
                except json.JSONDecodeError:
                    soap_note_data = {}

            encounter.ai_assessment_data = {
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "medications": treatment_plan.get("medications", []),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "soap_note": soap_note_data,
                "assessment_summary": final_state.get("assessment_summary"),
                "follow_up_plan": final_state.get("follow_up_plan"),
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
            }

            await db.commit()

        logger.info(f"Tool-based workflow complete: {len(final_state.get('tool_calls', []))} tools called")

        # Parse soap_note if it's a JSON string
        import json
        soap_note = final_state.get("soap_note")
        if isinstance(soap_note, str):
            try:
                soap_note = json.loads(soap_note)
            except json.JSONDecodeError:
                logger.warning("Failed to parse soap_note as JSON, returning as-is")
                soap_note = {}

        # Return response (compatible with frontend expectations)
        # Extract nested data for frontend
        treatment_plan = final_state.get("treatment_plan", {})
        clinical_assessment = final_state.get("clinical_assessment", {})

        return {
            "success": True,
            "status": "complete",  # Workflow completed without interrupts
            "encounter_id": request.encounter_id,
            "workflow_type": "tool_based",  # NEW: Indicates which workflow was used
            "final_state": {
                # Core clinical data (backward compatible)
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "assessment_summary": final_state.get("assessment_summary"),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "primary_diagnosis": final_state.get("differential_diagnoses", ["Unknown"])[0] if final_state.get("differential_diagnoses") else "Unknown",
                "diagnostic_reasoning": final_state.get("assessment_summary", ""),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "medications": treatment_plan.get("medications", []),
                "medication_education": final_state.get("medication_education"),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "interventions": final_state.get("interventions", []),
                "patient_education": final_state.get("patient_education"),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "soap_note": soap_note,  # Ensure it's always a dict
                "follow_up_plan": final_state.get("follow_up_plan"),

                # Workflow metadata
                "agent_history": final_state.get("agent_history", []),
                "current_step": final_state.get("current_step"),
                "workflow_complete": final_state.get("workflow_complete", False),

                # Tool trace + orchestrator reasoning for visualization
                "tool_calls": final_state.get("tool_calls", []),
                "orchestrator_reasoning": final_state.get("orchestrator_reasoning", []),
                "workflow_trace": {
                    "tools_used": [call["tool_name"] for call in final_state.get("tool_calls", [])],
                    "total_tools": len(final_state.get("tool_calls", [])),
                    "workflow_messages": final_state.get("messages", []),
                    "reasoning_trace": final_state.get("orchestrator_reasoning", []),
                },

                # Vision analysis results
                "skin_cancer_result": final_state.get("skin_cancer_result"),

                # Emergency handling
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
            }
        }

    except Exception as e:
        logger.error(f"Tool-based workflow failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Tool-based workflow execution failed: {str(e)}"
        )


@router.post("/resume-workflow")
async def resume_workflow(
    request: WorkflowResumptionRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Resume an interrupted workflow with CHW decision.

    When a workflow is interrupted for emergency confirmation, this endpoint
    resumes it with the CHW's approval or rejection decision.

    Args:
        request: Resumption request with encounter_id, thread_id, decision, and notes
        db: Database session

    Returns:
        Complete workflow response (same format as execute-tool-workflow)
    """
    from ..orchestrator.graph import create_tool_based_workflow

    logger.info(f"Resuming workflow for {request.encounter_id} - Decision: {request.decision}")

    try:
        # Create workflow with checkpointer (same instance type as initial execution)
        workflow = create_tool_based_workflow(use_checkpointer=True)
        config = {"configurable": {"thread_id": request.thread_id}}

        # Get current state from checkpoint
        state_snapshot = workflow.get_state(config)
        if not state_snapshot or not state_snapshot.values:
            raise HTTPException(
                status_code=404,
                detail="Workflow checkpoint not found. The workflow may have expired or server restarted."
            )

        current_state = dict(state_snapshot.values)
        timestamp = datetime.now().isoformat()

        # Update state based on CHW decision
        if request.decision == "approve":
            # Allow emergency_protocol to execute
            logger.info("CHW approved emergency protocol")
            current_state["awaiting_confirmation"] = False
            current_state["messages"] = current_state.get("messages", []) + [
                f"CHW APPROVED emergency protocol at {timestamp}: {request.chw_notes}"
            ]

        else:  # reject
            # Override emergency, skip emergency_protocol
            logger.info("CHW rejected emergency protocol (clinical override)")
            current_state["awaiting_confirmation"] = False
            current_state["is_emergency"] = False
            current_state["emergency_guidance"] = {
                "status": "CHW_OVERRIDE",
                "original_triage": current_state.get("triage_level"),
                "chw_decision": "reject",
                "chw_notes": request.chw_notes,
                "timestamp": timestamp,
            }
            current_state["triage_level"] = "URGENT"  # Downgrade from EMERGENCY
            current_state["messages"] = current_state.get("messages", []) + [
                f"CHW REJECTED emergency protocol at {timestamp}: {request.chw_notes}"
            ]

        # Update checkpoint with modified state
        workflow.update_state(config, current_state)

        # Resume workflow (None = use checkpoint state)
        final_state = workflow.invoke(None, config=config)

        # Update database with final results (same logic as execute endpoint)
        result = await db.execute(
            select(Encounter).where(Encounter.id == request.encounter_id)
        )
        encounter = result.scalar_one_or_none()

        if not encounter:
            raise HTTPException(status_code=404, detail="Encounter not found")

        # Update encounter with results
        # Update encounter status to completed
        encounter.status = "completed"
        if not encounter.started_at:
            encounter.started_at = datetime.now()
        encounter.completed_at = datetime.now()

        if final_state.get("triage_level"):
            encounter.triage_level = final_state["triage_level"]
        if final_state.get("assessment_summary"):
            encounter.assessment_summary = final_state["assessment_summary"]
        if final_state.get("soap_note"):
            encounter.soap_note = json.dumps(final_state["soap_note"])

        # Save full AI assessment results
        treatment_plan = final_state.get("treatment_plan", {})
        clinical_assessment = final_state.get("clinical_assessment", {})
        soap_note_data = final_state.get("soap_note")
        if isinstance(soap_note_data, str):
            try:
                soap_note_data = json.loads(soap_note_data)
            except json.JSONDecodeError:
                soap_note_data = {}

        encounter.ai_assessment_data = {
            "triage_level": final_state.get("triage_level"),
            "red_flags": final_state.get("red_flags", []),
            "differential_diagnoses": final_state.get("differential_diagnoses", []),
            "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
            "risk_level": final_state.get("risk_level"),
            "risk_recommendations": final_state.get("risk_recommendations", []),
            "referral_needed": final_state.get("referral_needed", False),
            "referral_type": final_state.get("referral_type"),
            "referral_urgency": final_state.get("referral_urgency"),
            "medications": treatment_plan.get("medications", []),
            "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
            "soap_note": soap_note_data,
            "assessment_summary": final_state.get("assessment_summary"),
            "follow_up_plan": final_state.get("follow_up_plan"),
            "is_emergency": final_state.get("is_emergency", False),
            "emergency_guidance": final_state.get("emergency_guidance"),
            # Store CHW confirmation decision
            "emergency_confirmation": {
                "required": True,
                "decision": request.decision,
                "chw_notes": request.chw_notes,
                "timestamp": timestamp,
            }
        }

        await db.commit()

        logger.info(f"Workflow resumed and completed for {request.encounter_id}")

        # Parse soap_note if it's a JSON string
        soap_note = final_state.get("soap_note")
        if isinstance(soap_note, str):
            try:
                soap_note = json.loads(soap_note)
            except json.JSONDecodeError:
                logger.warning("Failed to parse soap_note as JSON, returning as-is")
                soap_note = {}

        # Return same format as execute endpoint (backward compatible)
        treatment_plan = final_state.get("treatment_plan", {})
        clinical_assessment = final_state.get("clinical_assessment", {})

        return {
            "success": True,
            "status": "complete",
            "encounter_id": request.encounter_id,
            "workflow_type": "tool_based",
            "final_state": {
                # Core clinical data (backward compatible)
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "assessment_summary": final_state.get("assessment_summary"),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "primary_diagnosis": final_state.get("differential_diagnoses", ["Unknown"])[0] if final_state.get("differential_diagnoses") else "Unknown",
                "diagnostic_reasoning": final_state.get("assessment_summary", ""),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "medications": treatment_plan.get("medications", []),
                "medication_education": final_state.get("medication_education"),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "interventions": final_state.get("interventions", []),
                "patient_education": final_state.get("patient_education"),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "soap_note": soap_note,
                "follow_up_plan": final_state.get("follow_up_plan"),

                # Workflow metadata
                "agent_history": final_state.get("agent_history", []),
                "current_step": final_state.get("current_step"),
                "workflow_complete": final_state.get("workflow_complete", False),

                # Tool trace + orchestrator reasoning
                "tool_calls": final_state.get("tool_calls", []),
                "orchestrator_reasoning": final_state.get("orchestrator_reasoning", []),
                "workflow_trace": {
                    "tools_used": [call["tool_name"] for call in final_state.get("tool_calls", [])],
                    "total_tools": len(final_state.get("tool_calls", [])),
                    "workflow_messages": final_state.get("messages", []),
                    "reasoning_trace": final_state.get("orchestrator_reasoning", []),
                },

                # Vision analysis results
                "skin_cancer_result": final_state.get("skin_cancer_result"),

                # Emergency handling
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
            }
        }

    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Workflow resumption failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Workflow resumption failed: {str(e)}"
        )


@router.get("/stream-resume-workflow/{encounter_id}")
async def stream_resume_workflow(
    encounter_id: str,
    thread_id: str,
    decision: str,
    chw_notes: str = "",
    db: AsyncSession = Depends(get_db)
):
    """
    SSE endpoint: streams real-time tool progress while resuming an interrupted workflow.

    Called after CHW confirms or rejects the emergency protocol in the HiL dialog.
    Emits the same event types as /stream-workflow so the frontend WorkflowTracker
    can show live step transitions for all post-confirmation tools.

    Query params: thread_id, decision ("approve"|"reject"), chw_notes
    """
    from ..orchestrator.graph import create_tool_based_workflow
    from ..orchestrator.progress import _progress_queues

    async def event_generator():
        # Register queue BEFORE the workflow resumes so _emit_progress() has a target
        progress_q: stdlib_queue.SimpleQueue = stdlib_queue.SimpleQueue()
        _progress_queues[encounter_id] = progress_q

        yield ": ping\n\n"
        yield f"data: {json.dumps({'type': 'workflow_resume'})}\n\n"

        try:
            # Validate encounter exists
            result = await db.execute(select(Encounter).where(Encounter.id == encounter_id))
            encounter = result.scalar_one_or_none()
            if not encounter:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Encounter not found'})}\n\n"
                return

            # Run the sync resume logic (checkpoint lookup + state patch + workflow.invoke)
            # in a thread so it doesn't block the event loop while we stream events.
            def _sync_resume():
                workflow = create_tool_based_workflow(use_checkpointer=True)
                config = {"configurable": {"thread_id": thread_id}}

                state_snapshot = workflow.get_state(config)
                if not state_snapshot or not state_snapshot.values:
                    raise ValueError("Workflow checkpoint not found. Server may have restarted.")

                current_state = dict(state_snapshot.values)
                timestamp = datetime.now().isoformat()

                if decision == "approve":
                    logger.info("CHW approved emergency protocol (streaming resume)")
                    current_state["awaiting_confirmation"] = False
                    current_state["messages"] = current_state.get("messages", []) + [
                        f"CHW APPROVED emergency protocol at {timestamp}: {chw_notes}"
                    ]
                else:
                    logger.info("CHW rejected emergency protocol (streaming resume)")
                    current_state["awaiting_confirmation"] = False
                    current_state["is_emergency"] = False
                    current_state["emergency_guidance"] = {
                        "status": "CHW_OVERRIDE",
                        "original_triage": current_state.get("triage_level"),
                        "chw_decision": "reject",
                        "chw_notes": chw_notes,
                        "timestamp": timestamp,
                    }
                    current_state["triage_level"] = "URGENT"
                    current_state["messages"] = current_state.get("messages", []) + [
                        f"CHW REJECTED emergency protocol at {timestamp}: {chw_notes}"
                    ]

                workflow.update_state(config, current_state)
                return workflow.invoke(None, config=config)

            resume_task = asyncio.create_task(asyncio.to_thread(_sync_resume))

            # Stream events from the queue while the workflow runs
            while not resume_task.done():
                while True:
                    try:
                        event = progress_q.get_nowait()
                        yield f"data: {json.dumps(event)}\n\n"
                    except stdlib_queue.Empty:
                        break
                await asyncio.sleep(0.05)

            # Drain any remaining events after task finishes
            while True:
                try:
                    event = progress_q.get_nowait()
                    yield f"data: {json.dumps(event)}\n\n"
                except stdlib_queue.Empty:
                    break

            final_state = await resume_task

            # Update database with final results
            encounter.status = "completed"
            if not encounter.started_at:
                encounter.started_at = datetime.now()
            encounter.completed_at = datetime.now()

            if final_state.get("triage_level"):
                encounter.triage_level = final_state["triage_level"]
            if final_state.get("assessment_summary"):
                encounter.assessment_summary = final_state["assessment_summary"]
            if final_state.get("soap_note"):
                encounter.soap_note = json.dumps(final_state["soap_note"])

            treatment_plan = final_state.get("treatment_plan", {})
            clinical_assessment = final_state.get("clinical_assessment", {})
            soap_note_data = final_state.get("soap_note")
            if isinstance(soap_note_data, str):
                try:
                    soap_note_data = json.loads(soap_note_data)
                except json.JSONDecodeError:
                    soap_note_data = {}

            encounter.ai_assessment_data = {
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "medications": treatment_plan.get("medications", []),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "soap_note": soap_note_data,
                "assessment_summary": final_state.get("assessment_summary"),
                "follow_up_plan": final_state.get("follow_up_plan"),
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
                "emergency_confirmation": {
                    "required": True,
                    "decision": decision,
                    "chw_notes": chw_notes,
                    "timestamp": datetime.now().isoformat(),
                },
            }
            await db.commit()

            logger.info(f"Streaming resume complete for {encounter_id}")

            # Build complete payload — same shape as POST /resume-workflow final_state
            soap_note = final_state.get("soap_note")
            if isinstance(soap_note, str):
                try:
                    soap_note = json.loads(soap_note)
                except json.JSONDecodeError:
                    soap_note = {}

            treatment_plan = final_state.get("treatment_plan", {})
            clinical_assessment = final_state.get("clinical_assessment", {})

            payload = {
                "triage_level": final_state.get("triage_level"),
                "red_flags": final_state.get("red_flags", []),
                "assessment_summary": final_state.get("assessment_summary"),
                "differential_diagnoses": final_state.get("differential_diagnoses", []),
                "primary_diagnosis": (final_state.get("differential_diagnoses") or ["Unknown"])[0],
                "diagnostic_reasoning": final_state.get("assessment_summary", ""),
                "recommended_investigations": clinical_assessment.get("recommended_investigations", []),
                "medications": treatment_plan.get("medications", []),
                "medication_education": final_state.get("medication_education"),
                "care_plan_goals": final_state.get("care_plan_goals", []) or treatment_plan.get("care_plan_goals", []),
                "interventions": final_state.get("interventions", []),
                "patient_education": final_state.get("patient_education"),
                "risk_level": final_state.get("risk_level"),
                "risk_recommendations": final_state.get("risk_recommendations", []),
                "referral_needed": final_state.get("referral_needed", False),
                "referral_type": final_state.get("referral_type"),
                "referral_urgency": final_state.get("referral_urgency"),
                "soap_note": soap_note,
                "follow_up_plan": final_state.get("follow_up_plan"),
                "agent_history": final_state.get("agent_history", []),
                "current_step": final_state.get("current_step"),
                "workflow_complete": final_state.get("workflow_complete", False),
                "tool_calls": final_state.get("tool_calls", []),
                "orchestrator_reasoning": final_state.get("orchestrator_reasoning", []),
                "workflow_trace": {
                    "tools_used": [c["tool_name"] for c in final_state.get("tool_calls", [])],
                    "total_tools": len(final_state.get("tool_calls", [])),
                    "reasoning_trace": final_state.get("orchestrator_reasoning", []),
                },
                "skin_cancer_result": final_state.get("skin_cancer_result"),
                "is_emergency": final_state.get("is_emergency", False),
                "emergency_guidance": final_state.get("emergency_guidance"),
            }

            yield f"data: {json.dumps({'type': 'complete', 'data': payload})}\n\n"

        except Exception as e:
            logger.error(f"SSE resume stream error for {encounter_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            _progress_queues.pop(encounter_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
