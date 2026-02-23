"""
System Testing API - MedGemma Tools Validation

Provides endpoints to run and retrieve validation test results
for the 6 MedGemma tools.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import logging
from datetime import datetime
import asyncio

from app.core.medgemma_tools import get_medgemma_toolkit
from app.clinical_ai.domain.registry import registry

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/run-validation", response_model=Dict[str, Any])
async def run_validation_tests():
    """
    Run all MedGemma tool validation tests and return clean results.

    Returns a structured report suitable for display and PDF generation.
    """
    try:
        toolkit = get_medgemma_toolkit()
        results = []

        # Test 1: Clinical Assessment
        logger.info("Running Clinical Assessment test...")
        try:
            ca_tool = registry.get_tool("clinical_assessment")
            result1_state = ca_tool.execute({
                "symptoms": "3-day history of cough with greenish sputum, shortness of breath",
                "vitals": {
                    "temperature": {"value": "38.5", "unit": "°C"},
                    "oxygen_saturation": {"value": "94", "unit": "%"},
                    "respiratory_rate": {"value": "28", "unit": "/min"}
                },
                "patient_context": "Age: 8, Gender: female",
                "medical_history": "No significant past medical history"
            }, toolkit)
            result1 = result1_state.get("clinical_assessment", {})

            results.append({
                "test_number": 1,
                "test_name": "Clinical Assessment",
                "description": "Triage, differential diagnosis, and red flag detection",
                "status": "passed" if result1.get('triage_level') else "failed",
                "details": {
                    "triage_level": result1.get('triage_level', 'UNKNOWN'),
                    "differential_diagnoses": result1.get('differential_diagnoses', []),
                    "red_flags": result1.get('red_flags', []),
                    "investigations_recommended": result1.get('investigations_recommended', [])
                },
                "execution_time": "~15-25 seconds"
            })
        except Exception as e:
            logger.error(f"Clinical Assessment test failed: {e}")
            results.append({
                "test_number": 1,
                "test_name": "Clinical Assessment",
                "status": "failed",
                "error": str(e)
            })

        # Test 2: Treatment Advisor
        logger.info("Running Treatment Advisor test...")
        # Small delay between tests
        await asyncio.sleep(2)
        try:
            ta_tool = registry.get_tool("treatment_plan")
            result2_state = ta_tool.execute({
                "patient_context": "Age: 8, Gender: female, Weight: 25kg, No known allergies",
                "clinical_assessment": {
                    "triage_level": "URGENT",
                    "differential_diagnoses": ["Pneumonia", "Bronchitis"]
                }
            }, toolkit)
            result2 = result2_state.get("treatment_plan", {})

            results.append({
                "test_number": 2,
                "test_name": "Treatment Advisor",
                "description": "Medication recommendations and care plan goals",
                "status": "passed" if result2.get('medications') or result2.get('care_plan_goals') else "failed",
                "details": {
                    "medications_count": len(result2.get('medications', [])),
                    "medications": result2.get('medications', []),
                    "care_plan_goals": result2.get('care_plan_goals', [])
                },
                "execution_time": "~20-30 seconds"
            })
        except Exception as e:
            logger.error(f"Treatment Advisor test failed: {e}")
            results.append({
                "test_number": 2,
                "test_name": "Treatment Advisor",
                "status": "failed",
                "error": str(e)
            })

        # Test 3: SOAP Note Generation
        logger.info("Running SOAP Note Generation test...")
        # Small delay to let Ollama recover from previous tests
        await asyncio.sleep(2)
        try:
            # Use simpler data to reduce token usage
            soap_tool = registry.get_tool("soap_note")
            result3_state = soap_tool.execute({
                "patient_context": "8yo female",
                "symptoms": "3-day cough",
                "clinical_assessment": {"triage_level": "URGENT"},
                "treatment_plan": {"medications": [{"name": "Amoxicillin"}]}
            }, toolkit)
            result3 = result3_state.get("soap_note", {})

            has_all_sections = all(key in result3 for key in ['subjective', 'objective', 'assessment', 'plan'])

            results.append({
                "test_number": 3,
                "test_name": "SOAP Note Generation",
                "description": "Complete clinical documentation (S/O/A/P format)",
                "status": "passed" if has_all_sections else "failed",
                "details": {
                    "subjective": str(result3.get('subjective', 'MISSING')),
                    "objective": str(result3.get('objective', 'MISSING')),
                    "assessment": str(result3.get('assessment', 'MISSING')),
                    "plan": str(result3.get('plan', 'MISSING')),
                    "complete": has_all_sections
                },
                "execution_time": "~25-40 seconds"
            })
        except Exception as e:
            logger.error(f"SOAP Note Generation test failed: {e}")
            results.append({
                "test_number": 3,
                "test_name": "SOAP Note Generation",
                "status": "failed",
                "error": str(e)
            })

        # Test 4: Risk Assessor
        logger.info("Running Risk Assessor test...")
        # Small delay between tests
        await asyncio.sleep(2)
        try:
            risk_tool = registry.get_tool("risk_assessment")
            result4_state = risk_tool.execute({
                "patient_context": "Age: 8, Gender: female",
                "clinical_assessment": {
                    "triage_level": "URGENT",
                    "differential_diagnoses": ["Pneumonia"],
                    "red_flags": ["High fever", "Low oxygen"]
                },
                "medical_history": "No significant history"
            }, toolkit)
            result4 = result4_state.get("risk_assessment", {})

            results.append({
                "test_number": 4,
                "test_name": "Risk Assessor",
                "description": "Risk stratification and recommendations",
                "status": "passed" if result4.get('risk_level') else "failed",
                "details": {
                    "risk_level": result4.get('risk_level', 'UNKNOWN'),
                    "risk_factors": result4.get('risk_factors', []),
                    "chronic_conditions": result4.get('chronic_conditions', []),
                    "recommendations": result4.get('recommendations', [])
                },
                "execution_time": "~15-25 seconds"
            })
        except Exception as e:
            logger.error(f"Risk Assessor test failed: {e}")
            results.append({
                "test_number": 4,
                "test_name": "Risk Assessor",
                "status": "failed",
                "error": str(e)
            })

        # Test 5: Referral Advisor
        logger.info("Running Referral Advisor test...")
        # Small delay between tests
        await asyncio.sleep(2)
        try:
            ref_tool = registry.get_tool("referral_decision")
            result5_state = ref_tool.execute({
                "clinical_assessment": {
                    "triage_level": "URGENT",
                    "differential_diagnoses": ["Pneumonia"],
                    "red_flags": ["Low oxygen"]
                },
                "available_facilities": ["District Hospital", "Regional Medical Center"]
            }, toolkit)
            result5 = result5_state.get("referral_decision", {})

            results.append({
                "test_number": 5,
                "test_name": "Referral Advisor",
                "description": "Urgency determination and specialist recommendation",
                "status": "passed" if result5.get('referral_needed') is not None else "failed",
                "details": {
                    "referral_needed": result5.get('referral_needed', False),
                    "referral_type": result5.get('referral_type', 'N/A'),
                    "urgency": result5.get('referral_urgency', 'N/A'),
                    "reasoning": str(result5.get('referral_reasoning', 'N/A'))
                },
                "execution_time": "~20-30 seconds"
            })
        except Exception as e:
            logger.error(f"Referral Advisor test failed: {e}")
            results.append({
                "test_number": 5,
                "test_name": "Referral Advisor",
                "status": "failed",
                "error": str(e)
            })

        # Test 6: Emergency Protocol
        logger.info("Running Emergency Protocol test...")
        # Small delay between tests
        await asyncio.sleep(2)
        try:
            emerg_tool = registry.get_tool("emergency_protocol")
            result6_state = emerg_tool.execute({
                "symptoms": "Severe shortness of breath, cyanosis, altered mental status",
                "vitals": {
                    "oxygen_saturation": {"value": "88", "unit": "%"},
                    "respiratory_rate": {"value": "35", "unit": "/min"},
                    "heart_rate": {"value": "120", "unit": "bpm"}
                }
            }, toolkit)
            result6 = result6_state.get("emergency_guidance", {})

            results.append({
                "test_number": 6,
                "test_name": "Emergency Protocol",
                "description": "Life-threatening situation handling",
                "status": "passed" if result6.get('emergency_level') else "failed",
                "details": {
                    "emergency_level": result6.get('emergency_level', 'UNKNOWN'),
                    "immediate_actions_count": len(result6.get('immediate_actions', [])),
                    "immediate_actions": result6.get('immediate_actions', [])[:5],
                    "call_for_help": result6.get('call_for_help', 'N/A')
                },
                "execution_time": "~15-20 seconds"
            })
        except Exception as e:
            logger.error(f"Emergency Protocol test failed: {e}")
            results.append({
                "test_number": 6,
                "test_name": "Emergency Protocol",
                "status": "failed",
                "error": str(e)
            })

        # Calculate summary
        passed = sum(1 for r in results if r.get('status') == 'passed')
        failed = sum(1 for r in results if r.get('status') == 'failed')

        return {
            "test_suite": "MedGemma Tools Validation",
            "timestamp": datetime.utcnow().isoformat(),
            "summary": {
                "total_tests": len(results),
                "passed": passed,
                "failed": failed,
                "success_rate": f"{(passed / len(results) * 100):.1f}%"
            },
            "system_info": {
                "model": "MedGemma 2B (fine-tuned CHW)",
                "inference_engine": "Ollama",
                "quantization": "Q4_K_M (2.4GB)",
                "hardware": "CPU-only"
            },
            "test_results": results
        }

    except Exception as e:
        logger.error(f"Validation test suite failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run validation tests: {str(e)}"
        )


@router.get("/status", response_model=Dict[str, Any])
async def get_testing_status():
    """
    Check if the testing system is ready.
    """
    try:
        toolkit = get_medgemma_toolkit()
        return {
            "status": "ready",
            "toolkit_available": True,
            "message": "MedGemma toolkit is ready for validation testing"
        }
    except Exception as e:
        return {
            "status": "unavailable",
            "toolkit_available": False,
            "message": f"MedGemma toolkit not available: {str(e)}"
        }
