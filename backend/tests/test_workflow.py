"""
Test suite for tool-based clinical workflow.

Tests the MedGemma-powered orchestrator, 7 medical tools (6 text + 1 vision),
parallel execution, human-in-the-loop, error recovery, and state management.

Run with: python -m pytest tests/test_workflow.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from app.clinical_ai.domain.state import ToolBasedWorkflowState
from app.clinical_ai.orchestrator.agent import orchestrator_agent, _fallback_routing
from app.clinical_ai.orchestrator.executor import create_node_executor, emergency_confirmation_gate
from app.clinical_ai.tools.medgemma_adapters import (
    ClinicalAssessmentTool,
    EmergencyProtocolTool,
    RiskAssessmentTool,
    ReferralDecisionTool,
    TreatmentPlanTool,
    SoapNoteGenerationTool,
    SkinCancerDetectionTool,
    ParallelRiskReferralTool,
)

execute_clinical_assessment = create_node_executor(ClinicalAssessmentTool())
execute_emergency_protocol = create_node_executor(EmergencyProtocolTool())
execute_risk_assessment = create_node_executor(RiskAssessmentTool())
execute_referral_decision = create_node_executor(ReferralDecisionTool())
execute_treatment_plan = create_node_executor(TreatmentPlanTool())
execute_soap_note_generation = create_node_executor(SoapNoteGenerationTool())
execute_skin_cancer_detection = create_node_executor(SkinCancerDetectionTool())
execute_parallel_risk_referral = create_node_executor(ParallelRiskReferralTool())

from app.clinical_ai.orchestrator.graph import create_tool_based_workflow



# ============================================================================
# Test Fixtures
# ============================================================================

def _base_state(**overrides) -> dict:
    """Create a base workflow state with sensible defaults."""
    state = {
        "encounter_id": "test-encounter-001",
        "patient_id": "test-patient-001",
        "patient_context": "Age: 45, Gender: Female",
        "symptoms": "Chest pain, shortness of breath, diaphoresis",
        "vitals": {"blood_pressure": {"value": "160/95", "unit": "mmHg"}, "heart_rate": {"value": "110", "unit": "bpm"}},
        "medical_history": "Hypertension, Type 2 Diabetes",
        "image_path": None,
        "image_type": None,
        "clinical_assessment": None,
        "treatment_plan": None,
        "risk_assessment": None,
        "referral_decision": None,
        "emergency_guidance": None,
        "soap_note": None,
        "skin_cancer_result": None,
        "messages": [],
        "tool_calls": [],
        "orchestrator_reasoning": [],
        "next_action": "start",
        "workflow_complete": False,
        "is_emergency": False,
        "needs_referral": False,
        "awaiting_confirmation": False,
        "triage_level": None,
        "differential_diagnoses": None,
        "red_flags": None,
        "assessment_summary": None,
        "medication_education": None,
        "care_plan_goals": None,
        "interventions": None,
        "patient_education": None,
        "risk_level": None,
        "risk_recommendations": None,
        "referral_needed": None,
        "referral_type": None,
        "referral_urgency": None,
        "follow_up_plan": None,
        "agent_history": None,
        "current_step": "initializing",
    }
    state.update(overrides)
    return state


MOCK_CLINICAL_ASSESSMENT = {
    "triage_level": "URGENT",
    "differential_diagnoses": ["Acute Coronary Syndrome", "Angina"],
    "red_flags": ["Chest pain radiating to jaw", "Diaphoresis"],
    "recommended_investigations": ["ECG", "Troponin"],
    "reasoning": "URGENT triage. Differential diagnoses include Acute Coronary Syndrome, Angina. Red flags: Chest pain radiating to jaw, Diaphoresis.",
}

MOCK_EMERGENCY_ASSESSMENT = {
    "triage_level": "EMERGENCY",
    "differential_diagnoses": ["Myocardial Infarction"],
    "red_flags": ["Crushing chest pain", "ST elevation"],
    "recommended_investigations": ["ECG stat"],
    "reasoning": "EMERGENCY triage.",
}


# ============================================================================
# Orchestrator Tests
# ============================================================================

class TestOrchestrator:
    """Tests for MedGemma-powered orchestrator routing."""

    def test_guardrail_assessment_first(self):
        """Orchestrator must always call clinical_assessment first."""
        state = _base_state()
        result = orchestrator_agent(state)
        assert result["next_action"] == "clinical_assessment"
        assert "clinical assessment must come first" in result["orchestrator_reasoning"][0].lower()

    def test_guardrail_emergency_detected(self):
        """Emergency triage must trigger emergency protocol."""
        state = _base_state(clinical_assessment=MOCK_EMERGENCY_ASSESSMENT)
        result = orchestrator_agent(state)
        assert result["next_action"] == "emergency_protocol"
        assert result.get("is_emergency") is True

    def test_guardrail_workflow_complete(self):
        """Workflow should end when all essential steps are done."""
        state = _base_state(
            clinical_assessment=MOCK_CLINICAL_ASSESSMENT,
            treatment_plan={"medications": [{"name": "Aspirin"}], "care_plan_goals": ["Pain relief"]},
            soap_note={"subjective": "Chest pain", "objective": "BP 160/95", "assessment": "ACS", "plan": "Aspirin, ECG"},
        )
        result = orchestrator_agent(state)
        assert result["next_action"] == "end"
        assert result.get("workflow_complete") is True

    @patch("app.clinical_ai.orchestrator.agent.get_medgemma_toolkit")
    def test_medgemma_reasoning_called(self, mock_toolkit):
        """Orchestrator calls MedGemma for non-guardrail decisions."""
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = '{"next_action": "treatment_plan", "reasoning": "Diagnosis established, need treatment"}'
        mock_toolkit.return_value.chw_llm = mock_llm

        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = orchestrator_agent(state)

        mock_llm.invoke.assert_called_once()
        assert result["next_action"] == "treatment_plan"

    @patch("app.clinical_ai.orchestrator.agent.get_medgemma_toolkit")
    def test_fallback_on_llm_failure(self, mock_toolkit):
        """Orchestrator falls back to deterministic routing if MedGemma fails."""
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = Exception("Ollama not running")
        mock_toolkit.return_value.chw_llm = mock_llm

        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = orchestrator_agent(state)

        # Fallback should still pick a valid action
        assert result["next_action"] in {
            "parallel_risk_referral", "risk_assessment", "referral_decision",
            "treatment_plan", "soap_note", "skin_cancer_detection", "end",
        }

    @patch("app.clinical_ai.orchestrator.agent.get_medgemma_toolkit")
    def test_invalid_action_defaults_to_valid(self, mock_toolkit):
        """Invalid LLM action is rejected and replaced with a valid fallback action."""
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = '{"next_action": "invalid_tool", "reasoning": "test"}'
        mock_toolkit.return_value.chw_llm = mock_llm

        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = orchestrator_agent(state)
        # "invalid_tool" must never be returned; SOAP note guardrail fires when soap is missing
        valid_actions = {
            "clinical_assessment", "emergency_protocol", "skin_cancer_detection",
            "parallel_risk_referral", "risk_assessment", "referral_decision",
            "treatment_plan", "soap_note", "end",
        }
        assert result["next_action"] in valid_actions
        assert result["next_action"] != "invalid_tool"


# ============================================================================
# Fallback Routing Tests
# ============================================================================

class TestFallbackRouting:
    """Tests for deterministic fallback routing logic."""

    def test_skin_cancer_when_image_present(self):
        """Any image triggers skin cancer detection (only vision tool)."""
        state = _base_state(
            clinical_assessment=MOCK_CLINICAL_ASSESSMENT,
            image_path="/tmp/lesion.jpg",
            image_type="skin",
        )
        action, _ = _fallback_routing(state)
        assert action == "skin_cancer_detection"

    def test_parallel_when_both_missing(self):
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        action, _ = _fallback_routing(state)
        assert action == "parallel_risk_referral"

    def test_treatment_when_risk_referral_done(self):
        state = _base_state(
            clinical_assessment=MOCK_CLINICAL_ASSESSMENT,
            risk_assessment={"risk_level": "HIGH"},
            referral_decision={"referral_needed": True},
        )
        action, _ = _fallback_routing(state)
        assert action == "treatment_plan"

    def test_soap_when_treatment_done(self):
        state = _base_state(
            clinical_assessment=MOCK_CLINICAL_ASSESSMENT,
            risk_assessment={"risk_level": "HIGH"},
            referral_decision={"referral_needed": True},
            treatment_plan={"medications": []},
        )
        action, _ = _fallback_routing(state)
        assert action == "soap_note"

    def test_end_when_all_done(self):
        state = _base_state(
            clinical_assessment=MOCK_CLINICAL_ASSESSMENT,
            risk_assessment={"risk_level": "HIGH"},
            referral_decision={"referral_needed": True},
            treatment_plan={"medications": []},
            soap_note={"subjective": "test"},
        )
        action, _ = _fallback_routing(state)
        assert action == "end"


# ============================================================================
# Tool Executor Tests (with mocked MedGemma)
# ============================================================================

class TestToolExecutors:
    """Tests for individual tool executor nodes with mocked LLM."""

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_clinical_assessment_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = MOCK_CLINICAL_ASSESSMENT
        state = _base_state()
        result = execute_clinical_assessment(state)

        assert result["clinical_assessment"]["triage_level"] == "URGENT"
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["tool_name"] == "medgemma_clinical_assessment"

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_clinical_assessment_fallback_on_error(self, mock_toolkit):
        mock_toolkit.return_value._invoke.side_effect = Exception("Ollama error")
        state = _base_state()
        result = execute_clinical_assessment(state)

        # Should NOT crash — should return URGENT fallback
        assert result["clinical_assessment"]["triage_level"] == "URGENT"
        assert "Tool failure" in result["red_flags"][0]
        assert "WARNING" in result["messages"][0]

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_emergency_protocol_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = {
            "emergency_level": "CRITICAL",
            "immediate_actions": ["Call 911", "Aspirin 325mg"],
            "call_for_help": "CALL 911 NOW",
            "monitoring": "ABC monitoring",
        }
        state = _base_state()
        result = execute_emergency_protocol(state)

        assert result["emergency_guidance"]["emergency_level"] == "CRITICAL"
        assert len(result["emergency_guidance"]["immediate_actions"]) == 2

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_emergency_protocol_fallback(self, mock_toolkit):
        mock_toolkit.return_value._invoke.side_effect = Exception("error")
        state = _base_state()
        result = execute_emergency_protocol(state)

        # Should NOT crash — should return safe default
        assert result["emergency_guidance"]["emergency_level"] == "CRITICAL"
        assert "CALL 911" in result["messages"][0]

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_risk_assessment_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = {
            "risk_level": "HIGH",
            "risk_factors": ["Hypertension", "Diabetes"],
            "recommendations": ["Monitor BP daily"],
        }
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = execute_risk_assessment(state)

        assert result["risk_level"] == "HIGH"
        assert len(result["tool_calls"]) == 1

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_referral_decision_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = {
            "referral_needed": True,
            "referral_type": "Cardiology",
            "referral_urgency": "URGENT",
        }
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = execute_referral_decision(state)

        assert result["referral_needed"] is True
        assert result["referral_type"] == "Cardiology"

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_treatment_plan_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = {
            "medications": [{"name": "Aspirin", "dose": "325mg", "frequency": "once daily"}],
            "care_plan_goals": ["Pain management", "Cardiac monitoring"],
        }
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = execute_treatment_plan(state)

        assert len(result["treatment_plan"]["medications"]) == 1
        assert result["treatment_plan"]["medications"][0]["name"] == "Aspirin"

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_soap_note_success(self, mock_toolkit):
        mock_toolkit.return_value._invoke.return_value = {
            "subjective": "Patient reports chest pain",
            "objective": "BP 160/95, HR 110",
            "assessment": "Acute Coronary Syndrome",
            "plan": "Aspirin, ECG, cardiology referral",
        }
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = execute_soap_note_generation(state)

        assert "subjective" in result["soap_note"]
        assert "objective" in result["soap_note"]


# ============================================================================
# Parallel Execution Tests
# ============================================================================

class TestParallelExecution:
    """Tests for parallel risk + referral execution."""

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_parallel_executes_both(self, mock_toolkit):
        mock_toolkit.return_value._invoke.side_effect = [
            {
                "risk_level": "HIGH", "risk_factors": ["HTN"], "recommendations": ["Monitor"],
            },
            {
                "referral_needed": True, "referral_type": "Cardiology", "referral_urgency": "URGENT",
            }
        ]
        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)
        result = execute_parallel_risk_referral(state)

        # Both results should be present
        assert result["risk_assessment"]["risk_level"] == "HIGH"
        assert result["referral_decision"]["referral_needed"] is True
        # Should have 2 tool calls (one for each)
        assert len(result["tool_calls"]) == 2
        assert "Parallel execution" in result["messages"][-1]


# ============================================================================
# Human-in-the-Loop Tests
# ============================================================================

class TestHumanInTheLoop:
    """Tests for emergency confirmation gate."""

    def test_confirmation_gate_sets_flag(self):
        state = _base_state(triage_level="EMERGENCY", red_flags=["Cardiac arrest"])
        result = emergency_confirmation_gate(state)

        assert result["awaiting_confirmation"] is True
        assert "EMERGENCY DETECTED" in result["messages"][0]
        assert result["current_step"] == "emergency_confirmation"


# ============================================================================
# Error Recovery Tests
# ============================================================================

class TestErrorRecovery:
    """Tests for retry logic and safe fallbacks."""

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_retry_succeeds_on_second_attempt(self, mock_toolkit):
        """Tool should retry and succeed on second attempt."""
        mock_fn = mock_toolkit.return_value._invoke
        mock_fn.side_effect = [Exception("Temporary error"), MOCK_CLINICAL_ASSESSMENT]

        state = _base_state()
        result = execute_clinical_assessment(state)

        assert result["clinical_assessment"]["triage_level"] == "URGENT"
        assert mock_fn.call_count == 2

    @patch("app.core.medgemma_tools.get_medgemma_toolkit")
    def test_all_tools_have_safe_fallbacks(self, mock_toolkit):
        """Every tool should return safe defaults on complete failure."""
        mock_toolkit.return_value._invoke.side_effect = Exception("fail")

        state = _base_state(clinical_assessment=MOCK_CLINICAL_ASSESSMENT)

        # None of these should crash
        r1 = execute_clinical_assessment(_base_state())
        assert r1["clinical_assessment"]["triage_level"] == "URGENT"

        r2 = execute_emergency_protocol(state)
        assert r2["emergency_guidance"]["emergency_level"] == "CRITICAL"

        r3 = execute_risk_assessment(state)
        assert r3["risk_assessment"]["risk_level"] == "MODERATE"

        r4 = execute_referral_decision(state)
        assert r4["referral_decision"]["referral_needed"] is True

        r5 = execute_treatment_plan(state)
        assert r5["treatment_plan"]["medications"] == []

        r6 = execute_soap_note_generation(state)
        assert "Error" in r6["soap_note"]["subjective"]


# ============================================================================
# State Schema Tests
# ============================================================================

class TestStateSchema:
    """Tests for workflow state integrity."""

    def test_state_has_required_fields(self):
        state = _base_state()
        required_fields = [
            "encounter_id", "patient_id", "symptoms", "vitals",
            "messages", "tool_calls", "orchestrator_reasoning",
            "workflow_complete", "is_emergency", "current_step",
        ]
        for field in required_fields:
            assert field in state, f"Missing required field: {field}"

    def test_image_fields_present(self):
        state = _base_state(image_path="/tmp/test.jpg", image_type="skin")
        assert state["image_path"] == "/tmp/test.jpg"
        assert state["image_type"] == "skin"


# ============================================================================
# Workflow Graph Construction Tests
# ============================================================================

class TestWorkflowGraph:
    """Tests for LangGraph workflow compilation."""

    def test_graph_compiles_with_checkpointer(self):
        workflow = create_tool_based_workflow(use_checkpointer=True)
        assert workflow is not None

    def test_graph_compiles_without_checkpointer(self):
        workflow = create_tool_based_workflow(use_checkpointer=False)
        assert workflow is not None
