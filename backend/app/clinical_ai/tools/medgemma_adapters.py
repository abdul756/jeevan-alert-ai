import logging
import json
from datetime import datetime
from typing import Dict, Any

from app.core.config import settings
from app.core.medgemma_tools import _parse_json
from ..domain.state import ToolBasedWorkflowState
from ..domain.tools import BaseClinicalTool
from ..domain.registry import registry
from ..orchestrator.progress import _emit_progress
from ..utils.toolkit import _retry_tool

logger = logging.getLogger(__name__)

class ClinicalAssessmentTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "clinical_assessment"
    
    @property
    def description(self) -> str: return "Triage, differential diagnosis, red flags, investigations"

    @property
    def use_when(self) -> str: return "Start of workflow"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("clinical_assessment"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {
            "type": "step_start", "tool": self.name,
            "label": "Checking Symptoms & Vitals", "description": "AI reviewing symptoms, vitals, and identifying red flags",
        })
        try:
            prompt = (
                f'PATIENT: {state.get("patient_context", "")}, SYMPTOMS: {state.get("symptoms", "")}, '
                f'VITALS: {json.dumps(state.get("vitals", {}))}, HISTORY: {state.get("medical_history") or "None provided"}\n\n'
                'Return JSON only: {"triage_level": "EMERGENCY|URGENT|ROUTINE", '
                '"differential_diagnoses": ["dx1","dx2"], "red_flags": ["flag1"], '
                '"recommended_investigations": ["test1"]}\n\nJSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            # Synthesize reasoning
            triage = result.get("triage_level", "UNKNOWN")
            dx = result.get("differential_diagnoses", [])
            flags = result.get("red_flags", [])
            parts = []
            if dx: parts.append(f"Differential diagnoses include {', '.join(dx[:3])}")
            if flags: parts.append(f"Red flags: {', '.join(flags[:3])}")
            result["reasoning"] = f"{triage} triage. {'. '.join(parts)}." if parts else f"{triage} triage."

            _emit_progress(state.get("encounter_id", ""), {
                "type": "step_complete", "tool": self.name,
                "label": "Symptoms & Vitals Checked", "triage_level": triage,
                "red_flags": flags, "diagnoses": dx[:2],
            })
            return {
                "clinical_assessment": result,
                "tool_calls": [{
                    "tool_name": f"medgemma_{self.name}",
                    "input": f"Symptoms: {state.get('symptoms', '')[:100]}...",
                    "output": f"Triage: {triage}, Diagnoses: {len(dx)}",
                    "timestamp": datetime.now().isoformat(),
                }],
                "triage_level": triage,
                "differential_diagnoses": dx,
                "red_flags": flags,
                "assessment_summary": result.get("reasoning", ""),
                "messages": [f"Clinical assessment complete: {triage}"],
                "current_step": self.name,
            }
        except Exception as e:
            return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        logger.error(f"{self.name} failed: {error}")
        fallback = {
            "triage_level": "URGENT", "differential_diagnoses": [],
            "red_flags": ["Tool failure - manual assessment required"], "recommended_investigations": [],
            "reasoning": f"Assessment tool error: {error}. Defaulting to URGENT for safety.",
        }
        _emit_progress(state.get("encounter_id", ""), {
            "type": "step_complete", "tool": self.name,
            "label": "Symptoms Checked (Fallback)", "triage_level": "URGENT", "error": str(error),
        })
        return {
            "clinical_assessment": fallback,
            "tool_calls": [{"tool_name": f"medgemma_{self.name}", "input": f"Symptoms: {state.get('symptoms', '')[:100]}...", "output": "FALLBACK: Defaulted to URGENT due to tool error", "timestamp": datetime.now().isoformat()}],
            "triage_level": "URGENT", "red_flags": ["Tool failure - manual assessment required"],
            "messages": [f"WARNING: Clinical assessment failed — defaulting to URGENT for safety"],
            "current_step": self.name,
        }

class EmergencyProtocolTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "emergency_protocol"
    @property
    def description(self) -> str: return "Immediate emergency guidance (ABC)"
    @property
    def use_when(self) -> str: return "EMERGENCY triage or life-threatening cases only"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("emergency_guidance"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.warning(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {
            "type": "step_start", "tool": self.name, "label": "Activating Emergency Protocol",
            "description": "Generating immediate life-saving instructions for CHW",
        })
        try:
            prompt = (
                f'SYMPTOMS: {state.get("symptoms", "")}, VITALS: {json.dumps(state.get("vitals", {}))}\n\n'
                'Return JSON only: {"emergency_level": "CRITICAL|SEVERE|MODERATE", '
                '"immediate_actions": ["action1", "action2"], '
                '"call_for_help": "who to call", "monitoring": "what to monitor"}\n\nJSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            _emit_progress(state.get("encounter_id", ""), {
                "type": "step_complete", "tool": self.name, "label": "Emergency Protocol Ready", "emergency_level": result.get("emergency_level"),
            })
            return {
                "emergency_guidance": result,
                "tool_calls": [{"tool_name": f"medgemma_{self.name}", "input": f"Emergency case: {state.get('symptoms', '')[:100]}", "output": f"Level: {result.get('emergency_level')}, Actions: {len(result.get('immediate_actions', []))}", "timestamp": datetime.now().isoformat()}],
                "messages": [f"EMERGENCY PROTOCOL: {result.get('call_for_help', 'Call for help immediately')}"],
                "current_step": self.name,
            }
        except Exception as e:
            return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        logger.error(f"{self.name} failed: {error}")
        _emit_progress(state.get("encounter_id", ""), {
            "type": "step_complete", "tool": self.name, "label": "Emergency Protocol (Fallback)", "error": str(error),
        })
        fallback = {
            "emergency_level": "CRITICAL", "immediate_actions": ["Call emergency services immediately", "Monitor airway, breathing, circulation"],
            "call_for_help": "CALL 911 or local emergency number NOW", "monitoring": "Stay with patient, reassess vitals every 5 minutes",
        }
        return {
            "emergency_guidance": fallback,
            "tool_calls": [{"tool_name": f"medgemma_{self.name}", "input": f"Emergency case: {state.get('symptoms', '')[:100]}", "output": "FALLBACK: Default emergency response", "timestamp": datetime.now().isoformat()}],
            "messages": ["EMERGENCY: Tool error — CALL 911 NOW. Default emergency protocol activated."],
            "current_step": self.name,
        }

class RiskAssessmentTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "risk_assessment"
    @property
    def description(self) -> str: return "Risk level, factors, chronic conditions"
    @property
    def use_when(self) -> str: return "Patients with chronic conditions or risk factors"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("risk_assessment"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {
            "type": "step_start", "tool": self.name, "label": "Calculating Health Risk Level",
            "description": "Evaluating cardiovascular, readmission, and fall risks",
        })
        try:
            skin_context = ""
            if state.get("skin_cancer_result"):
                classification = state["skin_cancer_result"].get("classification", "unknown")
                confidence = state["skin_cancer_result"].get("confidence", 0.0)
                reasoning = state["skin_cancer_result"].get("reasoning", "")
                skin_context = (
                    f"\n\nSKIN CANCER SCREENING: {classification} (confidence: {confidence:.2f})\n"
                    f"Analysis: {reasoning}\n"
                    f"Consider this in your risk assessment, especially for malignancy risk factors."
                )

            patient_data = f"Context: {state.get('patient_context', '')}\nVitals: {state.get('vitals', {})}"
            prompt = (
                f'PATIENT: {patient_data}, ASSESSMENT: {json.dumps(state.get("clinical_assessment", {}))}, '
                f'HISTORY: {state.get("medical_history") or "None provided"}{skin_context}\n\n'
                'Return JSON only: {"risk_level": "HIGH|MODERATE|LOW", "risk_factors": ["factor1"], '
                '"chronic_conditions": ["condition1"], "recommendations": ["rec1"]}\n\nJSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Health Risk Calculated", "risk_level": result.get("risk_level")})
            return {
                "risk_assessment": result,
                "tool_calls": [{"tool_name": "medgemma_risk_assessor", "input": f"Assessing risk for patient: {state.get('patient_id', '')}", "output": f"Risk: {result.get('risk_level')}, Factors: {len(result.get('risk_factors', []))}", "timestamp": datetime.now().isoformat()}],
                "risk_level": result.get("risk_level"), "risk_recommendations": result.get("recommendations", []),
                "messages": [f"Risk assessment: {result.get('risk_level')} risk level"],
                "current_step": self.name,
            }
        except Exception as e: return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Risk Assessment (Fallback)", "risk_level": "MODERATE", "error": str(error)})
        return {
            "risk_assessment": {"risk_level": "MODERATE", "risk_factors": ["Assessment error"], "recommendations": ["Manual risk review required"]},
            "tool_calls": [{"tool_name": "medgemma_risk_assessor", "input": "risk", "output": "FALLBACK", "timestamp": datetime.now().isoformat()}],
            "risk_level": "MODERATE", "messages": [f"WARNING: Risk assessment failed — defaulting to MODERATE"], "current_step": self.name,
        }

class ReferralDecisionTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "referral_decision"
    @property
    def description(self) -> str: return "Referral decision, type, urgency"
    @property
    def use_when(self) -> str: return "When beyond CHW scope or red flags present"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("referral_decision"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {"type": "step_start", "tool": self.name, "label": "Checking if Specialist is Needed", "description": "Deciding urgency and type of specialist referral"})
        try:
            skin_context = ""
            if state.get("skin_cancer_result"):
                classification = state["skin_cancer_result"].get("classification", "unknown")
                confidence = state["skin_cancer_result"].get("confidence", 0.0)
                monitoring = state["skin_cancer_result"].get("monitoring_recommendation", "")
                skin_context = (
                    f"\n\nSKIN CANCER SCREENING: {classification} (confidence: {confidence:.2f})\n"
                    f"Recommendation: {monitoring}\n"
                    f"If malignant or low confidence, URGENT dermatology/oncology referral is needed."
                )

            prompt = (
                f'ASSESSMENT: {json.dumps(state.get("clinical_assessment", {}))}, FACILITIES: General Hospital{skin_context}\n\n'
                'Return JSON only: {"referral_needed": true, "referral_type": "specialty", '
                '"referral_urgency": "IMMEDIATE|URGENT|ROUTINE"}\n\nJSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            # Synthesize reasoning
            needed = result.get("referral_needed", False)
            rtype = result.get("referral_type", "Unknown")
            urgency = result.get("referral_urgency", "ROUTINE")
            result["referral_reasoning"] = (
                f"{urgency} referral to {rtype} recommended."
                if needed else "No referral needed. Manageable at primary care level."
            )
            
            _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Referral Decision Made", "referral_needed": needed, "referral_type": rtype, "referral_urgency": urgency})
            return {
                "referral_decision": result,
                "tool_calls": [{"tool_name": "medgemma_referral_advisor", "input": f"Referral decision for triage: {state.get('clinical_assessment', {}).get('triage_level')}", "output": f"Needed: {needed}, Type: {rtype}", "timestamp": datetime.now().isoformat()}],
                "needs_referral": needed, "referral_needed": needed, "referral_type": rtype, "referral_urgency": urgency,
                "messages": [f"Referral: {'Required' if needed else 'Not needed'}"], "current_step": self.name,
            }
        except Exception as e: return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Referral Decision (Fallback)", "referral_needed": True, "error": str(error)})
        return {
            "referral_decision": {"referral_needed": True, "referral_type": "General", "referral_urgency": "ROUTINE", "referral_reasoning": f"Error: {error}. Recommending referral for safety."},
            "tool_calls": [{"tool_name": "medgemma_referral_advisor", "input": "referral", "output": "FALLBACK", "timestamp": datetime.now().isoformat()}],
            "needs_referral": True, "referral_needed": True, "messages": ["WARNING: Referral decision failed — defaulting to referral for safety"], "current_step": self.name,
        }

class TreatmentPlanTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "treatment_plan"
    @property
    def description(self) -> str: return "Medications and care plan goals"
    @property
    def use_when(self) -> str: return "After diagnosis established"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("treatment_plan"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {"type": "step_start", "tool": self.name, "label": "Building Treatment Plan", "description": "Creating personalized medications, care goals, and patient education"})
        try:
            diagnosis = state.get("clinical_assessment", {}).get("differential_diagnoses", ["Unknown"])[0]
            
            skin_context = ""
            if state.get("skin_cancer_result"):
                classification = state["skin_cancer_result"].get("classification", "unknown")
                monitoring = state["skin_cancer_result"].get("monitoring_recommendation", "")
                skin_context = (
                    f"\n\nSKIN LESION ANALYSIS: {classification}\n"
                    f"Monitoring plan: {monitoring}\n"
                    f"Include appropriate follow-up schedule and self-monitoring education in care plan goals."
                )

            prompt = (
                f'DIAGNOSIS: {diagnosis}, PATIENT: {state.get("patient_context", "")}{skin_context}\n\n'
                'Return JSON only: {"medications": [{"name": "drug", "dose": "amt", '
                '"frequency": "freq"}], "care_plan_goals": ["goal1", "goal2"]}\n\nJSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Treatment Plan Ready", "medications_count": len(result.get("medications", [])), "goals_count": len(result.get("care_plan_goals", []))})
            return {
                "treatment_plan": result,
                "tool_calls": [{"tool_name": "medgemma_treatment_advisor", "input": f"Treatment for: {diagnosis}", "output": f"Medications: {len(result.get('medications', []))}, Goals: {len(result.get('care_plan_goals', []))}", "timestamp": datetime.now().isoformat()}],
                "medication_education": result.get("patient_education", ""), "care_plan_goals": result.get("care_plan_goals", []), "interventions": result.get("interventions", []), "patient_education": result.get("patient_education", ""),
                "messages": [f"Treatment plan created with {len(result.get('medications', []))} medications"], "current_step": self.name,
            }
        except Exception as e: return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Treatment Plan (Fallback)", "error": str(error)})
        return {
            "treatment_plan": {"medications": [], "care_plan_goals": ["Manual treatment planning required"]},
            "tool_calls": [{"tool_name": "medgemma_treatment_advisor", "input": "treatment", "output": "FALLBACK", "timestamp": datetime.now().isoformat()}],
            "messages": ["WARNING: Treatment plan failed — manual planning required"], "current_step": self.name,
        }

class SoapNoteGenerationTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "soap_note"
    @property
    def description(self) -> str: return "Structured SOAP note for documentation"
    @property
    def use_when(self) -> str: return "End of workflow"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("soap_note"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {"type": "step_start", "tool": "soap_note_generation", "label": "Writing Clinical Notes", "description": "Generating SOAP documentation for medical records"})
        try:
            ca = state.get("clinical_assessment", {})
            triage = ca.get("triage_level", "ROUTINE")
            diagnoses = ca.get("differential_diagnoses", [])
            red_flags = ca.get("red_flags", [])

            assessment_summary = f"Triage: {triage}"
            if diagnoses: assessment_summary += f", Diagnoses: {', '.join(diagnoses[:2])}"
            if red_flags: assessment_summary += f", Red flags: {', '.join(red_flags[:2])}"

            treatment_summary = "Not yet available"
            if state.get("treatment_plan") and state["treatment_plan"].get("medications"):
                treatment_summary = f"{len(state['treatment_plan']['medications'])} medications prescribed"

            encounter_context = f"Patient: {state.get('patient_context', '')}\nSymptoms: {state.get('symptoms', '')}\nVitals: {state.get('vitals', {})}\nAssessment: {state.get('assessment_summary', 'See clinical assessment')}"
            
            prompt = (
                f'Generate a structured SOAP note for this encounter.\n\n'
                f'ENCOUNTER INFORMATION:\n{encounter_context}\n\n'
                f'CLINICAL ASSESSMENT:\n{assessment_summary}\n\n'
                f'TREATMENT:\n{treatment_summary}\n\n'
                f'TASK: Create a complete SOAP note with these 4 sections.\n'
                f'Return ONLY this JSON format:\n'
                f'{{"subjective": "patient complaints and history", '
                f'"objective": "vital signs and exam findings", '
                f'"assessment": "clinical impression and diagnoses", '
                f'"plan": "treatment and follow-up plan"}}\n\n'
                f'JSON:'
            )
            result = _retry_tool(toolkit._invoke, prompt, tool_name=self.name)
            
            _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": "soap_note_generation", "label": "Clinical Notes Written"})
            return {
                "soap_note": result,
                "tool_calls": [{"tool_name": "medgemma_soap_generator", "input": f"Documenting encounter {state.get('encounter_id', '')}", "output": f"SOAP note: {len(str(result))} characters", "timestamp": datetime.now().isoformat()}],
                "messages": ["SOAP note generated successfully"], "current_step": self.name,
            }
        except Exception as e: return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": "soap_note_generation", "label": "Clinical Notes (Fallback)", "error": str(error)})
        return {
            "soap_note": {"subjective": "Error", "objective": str(error), "assessment": "Manual documentation required", "plan": "Complete documentation manually"},
            "tool_calls": [{"tool_name": "medgemma_soap_generator", "input": "soap", "output": "FALLBACK", "timestamp": datetime.now().isoformat()}],
            "messages": ["WARNING: SOAP note generation failed — manual documentation needed"], "current_step": self.name,
        }

class SkinCancerDetectionTool(BaseClinicalTool):
    @property
    def name(self) -> str: return "skin_cancer_detection"
    @property
    def description(self) -> str: return "Dermoscopic skin lesion analysis for malignancy using ISIC fine-tuned MedGemma"
    @property
    def use_when(self) -> str: return "When skin lesion image is provided for cancer screening"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("skin_cancer_result"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool: {self.name}")
        _emit_progress(state.get("encounter_id", ""), {"type": "step_start", "tool": self.name, "label": "Scanning Skin Image with AI", "description": "ISIC-trained MedGemma analyzing dermoscopic image for skin cancer"})
        try:
            image_path = state.get("image_path", "")
            context = state.get("patient_context", "")
            age = context.split("Age:")[1].split(",")[0].strip() if "Age:" in context else None
            sex = context.split("Gender:")[1].split(",")[0].strip() if "Gender:" in context else None
            
            def custom_evaluation():
                from langchain_core.messages import HumanMessage
                import base64
                
                metadata = (
                    f"Patient: {age or 'unknown'} year old {sex or 'unknown'}\\n"
                    f"Lesion site: unknown, size: unknown mm\\n"
                )
                prompt = (
                    "You are a dermatology expert analyzing a dermoscopic skin lesion image.\\n"
                    f"{metadata}\\n"
                    "Analyze the image for signs of malignancy. In your reasoning, describe:\\n"
                    "1. Key visual features (asymmetry, border, color, diameter, evolution)\\n"
                    "2. Concerning features if present (irregular pigmentation, ulceration, etc.)\\n"
                    "3. Clinical recommendation (monitoring frequency, biopsy indication, urgency)\\n\\n"
                    'Return ONLY valid JSON:\\n'
                    '{"classification": "benign" or "malignant", '
                    '"confidence": 0.0-1.0, '
                    '"reasoning": "detailed analysis of features and clinical recommendation"}\\n'
                    'JSON:'
                )
                
                with open(image_path, "rb") as f:
                    image_b64 = base64.b64encode(f.read()).decode("utf-8")
                
                msg = HumanMessage(content=[
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
                ])
                
                response = toolkit.isic_llm.invoke([msg])
                
                from ...core.medgemma_tools import _parse_json
                return _parse_json(response.content)
            
            result = _retry_tool(custom_evaluation, tool_name=self.name)
            
            classification = result.get("classification", "benign")
            confidence = result.get("confidence", 0.5)
            reasoning = result.get("reasoning", "No detailed analysis provided")
            urgency = "urgent" if classification == "malignant" else "routine"

            # Determine monitoring recommendation
            if classification == "malignant":
                monitoring = "Immediate biopsy and dermatology referral required"
            elif confidence < 0.7:
                monitoring = "Close monitoring recommended - re-evaluate in 3 months or earlier if changes"
            else:
                monitoring = "Routine monitoring - annual skin check recommended"
                
            result["monitoring_recommendation"] = monitoring
            result["requires_referral"] = classification == "malignant" or confidence < 0.7
            result["urgency"] = urgency

            detailed_output = f"Classification: {classification} (confidence: {confidence:.2f})\nReasoning: {reasoning}\nMonitoring: {monitoring}\nReferral needed: {result.get('requires_referral')}"
            _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Skin Image Analyzed", "classification": classification, "confidence": round(confidence, 2), "requires_referral": result.get("requires_referral")})
            return {
                "skin_cancer_result": result,
                "tool_calls": [{"tool_name": "isic_skin_cancer_detection", "input": f"Skin image: {image_path}", "output": detailed_output, "timestamp": datetime.now().isoformat()}],
                "messages": [f"Skin cancer screening: {classification} (confidence: {confidence:.2f})", f"Analysis: {reasoning}", f"Recommendation: {monitoring}"],
                "current_step": self.name,
            }
        except Exception as e: return self.get_fallback_state(state, e)

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Skin Scan (Fallback)", "classification": "unknown", "error": str(error)})
        return {
            "skin_cancer_result": {"classification": "unknown", "confidence": 0.0, "reasoning": f"Error: {error}", "requires_referral": True, "urgency": "routine"},
            "tool_calls": [{"tool_name": "isic_skin_cancer_detection", "input": "skin", "output": "FALLBACK", "timestamp": datetime.now().isoformat()}],
            "messages": ["WARNING: Skin cancer detection failed — recommend dermatology referral"], "current_step": self.name,
        }

class ParallelRiskReferralTool(BaseClinicalTool):
    """
    Simulates a parallel execution of RiskAssessment and ReferralDecision tools.
    """
    @property
    def name(self) -> str: return "parallel_risk_referral"
    
    @property
    def description(self) -> str: return "Run risk assessment and referral decision in parallel"
    
    @property
    def use_when(self) -> str: return "When both risk and referral assessments are needed simultaneously"
    def is_complete(self, state: ToolBasedWorkflowState) -> bool: return bool(state.get("risk_assessment") and state.get("referral_decision"))

    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        logger.info(f"Executing OOP Tool (Parallel): {self.name}")
        _emit_progress(state.get("encounter_id", ""), {"type": "step_start", "tool": self.name, "label": "Running Risk & Referral Check Together", "description": "Simultaneously assessing health risk and specialist referral need"})
        
        # Instantiate sub-tools and run
        risk_tool = RiskAssessmentTool()
        ref_tool = ReferralDecisionTool()
        
        risk_result = risk_tool.execute(state, toolkit)
        referral_result = ref_tool.execute(state, toolkit)

        # Merge results correctly
        merged = {}
        for key, value in risk_result.items():
            if key == "tool_calls": merged.setdefault("tool_calls", []).extend(value)
            elif key == "messages": merged.setdefault("messages", []).extend(value)
            else: merged[key] = value

        for key, value in referral_result.items():
            if key == "tool_calls": merged.setdefault("tool_calls", []).extend(value)
            elif key == "messages": merged.setdefault("messages", []).extend(value)
            else: merged[key] = value

        merged["current_step"] = self.name
        merged["messages"] = merged.get("messages", []) + ["Parallel execution: risk + referral completed simultaneously"]
        _emit_progress(state.get("encounter_id", ""), {"type": "step_complete", "tool": self.name, "label": "Risk & Referral Check Complete", "risk_level": merged.get("risk_level"), "referral_needed": merged.get("referral_needed")})
        return merged

    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        # Fallback handled natively inside subtools
        return {}

# Register all default tools into the global registry
registry.register(ClinicalAssessmentTool())
registry.register(EmergencyProtocolTool())
registry.register(RiskAssessmentTool())
registry.register(ReferralDecisionTool())
registry.register(TreatmentPlanTool())
registry.register(SoapNoteGenerationTool())
registry.register(SkinCancerDetectionTool())
registry.register(ParallelRiskReferralTool())
