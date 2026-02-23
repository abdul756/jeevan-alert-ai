from typing import TypedDict, Annotated, Sequence, List, Dict, Any, Optional
import operator

class ToolBasedWorkflowState(TypedDict):
    """
    State for tool-based clinical workflow.

    Tracks orchestrator reasoning, tool calls, and clinical outputs.
    """
    # Input
    encounter_id: str
    patient_id: str
    patient_context: str
    symptoms: str
    vitals: dict
    medical_history: Optional[str]
    image_path: Optional[str]
    image_type: Optional[str]  # "skin", "xray", "general"

    # Tool outputs
    clinical_assessment: Optional[dict]
    treatment_plan: Optional[dict]
    risk_assessment: Optional[dict]
    referral_decision: Optional[dict]
    emergency_guidance: Optional[dict]
    soap_note: Optional[dict]
    skin_cancer_result: Optional[dict]

    # Workflow control
    messages: Annotated[Sequence[str], operator.add]
    tool_calls: Annotated[List[Dict[str, Any]], operator.add]
    orchestrator_reasoning: Annotated[List[str], operator.add]
    next_action: str
    workflow_complete: bool
    is_emergency: bool
    needs_referral: bool
    awaiting_confirmation: bool

    # Final state (for backward compatibility with frontend)
    triage_level: Optional[str]
    differential_diagnoses: Optional[List[str]]
    red_flags: Optional[List[str]]
    assessment_summary: Optional[str]
    medication_education: Optional[str]
    care_plan_goals: Optional[List[str]]
    interventions: Optional[List[str]]
    patient_education: Optional[str]
    risk_level: Optional[str]
    risk_recommendations: Optional[List[str]]
    referral_needed: Optional[bool]
    referral_type: Optional[str]
    referral_urgency: Optional[str]
    follow_up_plan: Optional[str]
    agent_history: Optional[List[str]]
    current_step: str
