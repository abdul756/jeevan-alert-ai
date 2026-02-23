import logging
import json
from typing import Dict, Any

from ..domain.state import ToolBasedWorkflowState
from ..domain.registry import registry
from .progress import _emit_progress
from ...core.medgemma_tools import get_medgemma_toolkit, _parse_json

logger = logging.getLogger(__name__)

def orchestrator_agent(state: ToolBasedWorkflowState) -> Dict[str, Any]:
    """
    MedGemma-powered orchestrator that reasons about which tool to call next.

    Instead of hardcoded if/else, the orchestrator calls MedGemma to analyze
    the clinical context and decide the optimal next step. Safety guardrails
    override the LLM for critical paths (emergency, assessment-first).
    """
    logger.info("=" * 60)
    logger.info("ORCHESTRATOR: MedGemma reasoning about next step")
    logger.info("=" * 60)

    toolkit = get_medgemma_toolkit()

    # Build summary of completed steps and available tools dynamically
    completed = []
    available = []
    
    for tool in registry.get_all_tools():
        if tool.is_complete(state):
            if tool.name == "clinical_assessment":
                ca = state["clinical_assessment"]
                completed.append(f"clinical_assessment: triage={ca.get('triage_level', '?')}, diagnoses={ca.get('differential_diagnoses', [])}")
            elif tool.name == "skin_cancer_detection":
                scr = state["skin_cancer_result"]
                completed.append(f"skin_cancer_detection: {scr.get('classification', '?')} ({scr.get('confidence', 0):.2f})")
            elif tool.name != "parallel_risk_referral":
                completed.append(f"{tool.name}: complete")
        else:
            # Context-specific filters to reduce LLM hallucination
            if tool.name == "skin_cancer_detection" and not state.get("image_path"):
                continue
            if tool.name == "parallel_risk_referral" and (state.get("risk_assessment") or state.get("referral_decision") or not state.get("clinical_assessment")):
                continue
            if tool.name in ["risk_assessment", "referral_decision", "treatment_plan", "soap_note"] and not state.get("clinical_assessment"):
                continue
            if tool.name == "emergency_protocol" and not state.get("is_emergency"):
                continue
                
            available.append(f"{tool.name}: {tool.description} (Use when: {tool.use_when})")
            
    available.append("end: All necessary steps complete, workflow finished")

    logger.info(f"ORCHESTRATOR STATE KEYS: {list(state.keys())}")
    logger.info(f"ORCHESTRATOR STATE: {state.get('risk_assessment')}")
    logger.info(f"ORCHESTRATOR COMPLETED TOOLS: {completed}")
    logger.info(f"ORCHESTRATOR AVAILABLE TOOLS: {available}")

    # ── Safety guardrails (override LLM for critical decisions) ──
    updates: Dict[str, Any] = {
        "messages": [],
        "orchestrator_reasoning": [],
        "current_step": "orchestrator",
    }

    # Guardrail 1: Clinical assessment must always come first
    if not state.get("clinical_assessment"):
        reasoning = "Safety guardrail: clinical assessment must come first before any other tool"
        logger.info(f"ORCHESTRATOR: {reasoning}")
        updates["next_action"] = "clinical_assessment"
        updates["messages"] = [f"Orchestrator: {reasoning}"]
        updates["orchestrator_reasoning"] = [reasoning]
        return updates

    # Guardrail 2: Emergency detected → must run emergency protocol
    triage = state["clinical_assessment"].get("triage_level", "")
    if triage == "EMERGENCY" and not state.get("emergency_guidance"):
        reasoning = "Safety guardrail: EMERGENCY triage detected, must activate emergency protocol immediately"
        logger.warning(f"ORCHESTRATOR: {reasoning}")
        updates["next_action"] = "emergency_protocol"
        updates["is_emergency"] = True
        updates["messages"] = [f"Orchestrator: {reasoning}"]
        updates["orchestrator_reasoning"] = [reasoning]
        return updates

    # Guardrail 2.1: Check if CHW overrode emergency status
    if (state.get("emergency_guidance") or {}).get("status") == "CHW_OVERRIDE":
        reasoning = "Emergency protocol overridden by CHW - continuing with URGENT pathway"
        logger.info(f"ORCHESTRATOR: {reasoning}")
        # Don't trigger emergency_protocol, continue with normal flow
        # The triage has already been downgraded to URGENT in the resume endpoint

    # Guardrail 2.5: Image provided → must run skin detection before treatment/SOAP
    if state.get("image_path") and not state.get("skin_cancer_result"):
        reasoning = "Safety guardrail: skin image provided, must analyze with ISIC model before proceeding"
        logger.info(f"ORCHESTRATOR: {reasoning}")
        updates["next_action"] = "skin_cancer_detection"
        updates["messages"] = [f"Orchestrator: {reasoning}"]
        updates["orchestrator_reasoning"] = [reasoning]
        return updates

    # Guardrail 3: All essential steps done → generate SOAP and finish
    if (state.get("clinical_assessment") and state.get("treatment_plan")
            and state.get("soap_note")
            and (not state.get("image_path") or state.get("skin_cancer_result"))):
        reasoning = "All essential clinical steps complete — workflow finished"
        logger.info(f"ORCHESTRATOR: {reasoning}")
        updates["next_action"] = "end"
        updates["workflow_complete"] = True
        updates["messages"] = [f"Orchestrator: {reasoning}"]
        updates["orchestrator_reasoning"] = [reasoning]
        return updates

    # ── MedGemma reasoning for non-critical decisions ──

    # Build routing guidance based on skin cancer results
    routing_guidance = ""
    if state.get("skin_cancer_result"):
        scr = state["skin_cancer_result"]
        classification = scr.get("classification", "unknown")
        confidence = scr.get("confidence", 0.0)

        routing_guidance = "\n**ROUTING GUIDANCE based on skin cancer detection:**\n"
        if classification == "malignant" or confidence < 0.7:
            routing_guidance += (
                f"- Skin analysis shows {classification} ({confidence:.2f}) — URGENT case\n"
                f"- Priority sequence: risk_assessment → referral_decision (URGENT) → treatment_plan → soap_note\n"
                f"- Risk assessment should evaluate malignancy risk factors\n"
                f"- Referral decision should prioritize dermatology/oncology urgency\n"
                f"- Treatment plan should include biopsy coordination and patient education on warning signs\n"
            )
        else:
            routing_guidance += (
                f"- Skin analysis shows {classification} ({confidence:.2f}) — routine monitoring\n"
                f"- Standard sequence: risk_assessment → treatment_plan → soap_note\n"
                f"- Risk assessment should note stable lesion characteristics\n"
                f"- Treatment plan should include monitoring schedule and self-exam education\n"
            )

    prompt = (
        "You are a clinical workflow orchestrator for a Community Health Worker.\n\n"
        f"Patient: {state['patient_context']}\n"
        f"Symptoms: {state['symptoms']}\n"
        f"Vitals: {json.dumps(state['vitals'])}\n"
        f"Medical History: {state.get('medical_history') or 'None provided'}\n"
        f"Image available: {'Yes (' + (state.get('image_type') or 'general') + ')' if state.get('image_path') else 'No'}\n\n"
        f"Steps completed:\n{json.dumps(completed, indent=2) if completed else 'None yet'}\n"
        f"{routing_guidance}\n"
        f"Available next tools:\n" + "\n".join(f"- {t}" for t in available) + "\n\n"
        "Based on the clinical context and routing guidance above, which SINGLE tool should be called next? "
        "Choose ONLY ONE from the 'Available next tools' list. Do NOT choose tools that are already completed.\n"
        'Return JSON only: {"next_action": "<tool_name>", "reasoning": "<brief clinical reasoning>"}\n'
        "JSON:"
    )

    try:
        raw = toolkit.chw_llm.invoke(prompt)
        parsed = _parse_json(raw)
        next_action = parsed.get("next_action", "end")
        reasoning = parsed.get("reasoning", "MedGemma orchestrator decision")

        # Parse tool names from available list for validation
        available_action_names = {t.split(":")[0] for t in available if ":" in t}
        available_action_names.add("end")
        
        # Guardrail: Prevent the LLM from hallucinating tools or repeating completed tools
        if next_action not in available_action_names:
            logger.warning(f"ORCHESTRATOR: LLM chose '{next_action}' which is not in available actions. Forcing fallback.")
            # Fallback to the first available logical tool, or end
            if "risk_assessment" in available_action_names and next_action in ["referral_decision", "treatment_plan", "soap_note"]:
                next_action = "risk_assessment"
            elif "treatment_plan" in available_action_names:
                next_action = "treatment_plan"
            elif "soap_note" in available_action_names:
                next_action = "soap_note"
            else:
                next_action = "end"
            reasoning = f"Validation override: '{next_action}' was the next available step in sequence."

        logger.info(f"ORCHESTRATOR (MedGemma): {next_action} — {reasoning}")

        # Validation: Prevent ending without SOAP note
        if next_action == "end" and not state.get("soap_note"):
            logger.warning("ORCHESTRATOR: Cannot end workflow without SOAP note — forcing soap_note")
            next_action = "soap_note"
            reasoning = "Validation override: SOAP note required before workflow completion"

    except Exception as e:
        # Fallback: deterministic logic if MedGemma fails
        logger.warning(f"ORCHESTRATOR: MedGemma reasoning failed ({e}), using fallback logic")
        next_action, reasoning = _fallback_routing(state)

    updates["next_action"] = next_action
    updates["messages"] = [f"Orchestrator reasoning: {reasoning}"]
    updates["orchestrator_reasoning"] = [reasoning]

    if next_action == "end":
        updates["workflow_complete"] = True

    # Emit orchestrator reasoning to SSE progress queue
    _emit_progress(state.get("encounter_id", ""), {
        "type": "orchestrator",
        "reasoning": reasoning,
        "next_action": next_action,
    })

    return updates


def _fallback_routing(state: ToolBasedWorkflowState) -> tuple:
    """Deterministic fallback routing if MedGemma reasoning fails."""
    if state.get("image_path") and not state.get("skin_cancer_result"):
        return "skin_cancer_detection", "Fallback: skin image provided, running ISIC model"
    if not state.get("risk_assessment") and not state.get("referral_decision"):
        return "parallel_risk_referral", "Fallback: running risk + referral in parallel"
    if not state.get("risk_assessment"):
        return "risk_assessment", "Fallback: risk assessment needed"
    if not state.get("referral_decision"):
        return "referral_decision", "Fallback: referral decision needed"
    if not state.get("treatment_plan"):
        return "treatment_plan", "Fallback: treatment plan needed"
    if not state.get("soap_note"):
        return "soap_note", "Fallback: documentation needed"
    return "end", "Fallback: all steps complete"

