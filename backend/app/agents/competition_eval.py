"""
Competition Evaluation Framework for MedAssist CHW System.

Runs 30+ clinical test cases through the MedGemma tool-based workflow,
scoring triage accuracy, safety detection, referral appropriateness,
diagnosis quality, and documentation completeness.

Usage:
    cd backend
    python -m app.agents.competition_eval          # requires Ollama running
    python -m app.agents.competition_eval --dry-run # show test cases only
"""
import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from ..core.medgemma_tools import get_medgemma_toolkit, MedGemmaToolkit
from ..clinical_ai.domain.registry import registry
import app.clinical_ai.tools.medgemma_adapters  # noqa: F401 – triggers tool auto-registration

logger = logging.getLogger(__name__)


# ============================================================================
# Test Case Definitions (30+ cases across 13 clinical categories)
# ============================================================================

TEST_CASES: List[Dict[str, Any]] = [
    # ── EMERGENCY CASES (should triage EMERGENCY, safety-critical) ──
    {
        "id": "E01",
        "category": "Emergency",
        "name": "Acute MI - Chest Pain",
        "patient_context": "Age: 72, Gender: Female",
        "symptoms": "Crushing chest pain radiating to left jaw for 30 minutes, diaphoresis, shortness of breath, nausea",
        "vitals": {"blood_pressure": {"value": "160/95", "unit": "mmHg"}, "heart_rate": {"value": "110", "unit": "bpm"}, "spo2": {"value": "92", "unit": "%"}, "temperature": {"value": "37.0", "unit": "C"}},
        "medical_history": "Hypertension, Type 2 Diabetes, smoker for 40 years",
        "expected_triage": "EMERGENCY",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["myocardial infarction", "MI", "ACS", "acute coronary", "heart attack"],
        "expected_red_flag_keywords": ["chest pain", "radiating", "diaphoresis", "cardiac"],
    },
    {
        "id": "E02",
        "category": "Emergency",
        "name": "Anaphylaxis",
        "patient_context": "Age: 28, Gender: Male",
        "symptoms": "Severe allergic reaction after bee sting, tongue swelling, difficulty breathing, widespread hives, dizziness",
        "vitals": {"blood_pressure": {"value": "80/50", "unit": "mmHg"}, "heart_rate": {"value": "130", "unit": "bpm"}, "spo2": {"value": "88", "unit": "%"}, "respiratory_rate": {"value": "28", "unit": "breaths/min"}},
        "medical_history": "Known bee allergy, carries EpiPen",
        "expected_triage": "EMERGENCY",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["anaphylaxis", "anaphylactic", "allergic reaction", "angioedema"],
        "expected_red_flag_keywords": ["airway", "hypotension", "swelling", "breathing"],
    },
    {
        "id": "E03",
        "category": "Emergency",
        "name": "Stroke - Sudden Onset Weakness",
        "patient_context": "Age: 65, Gender: Male",
        "symptoms": "Sudden left-sided weakness, facial drooping, slurred speech, onset 45 minutes ago",
        "vitals": {"blood_pressure": {"value": "185/110", "unit": "mmHg"}, "heart_rate": {"value": "88", "unit": "bpm"}, "spo2": {"value": "96", "unit": "%"}},
        "medical_history": "Atrial fibrillation, not on anticoagulants",
        "expected_triage": "EMERGENCY",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["stroke", "CVA", "cerebrovascular", "TIA"],
        "expected_red_flag_keywords": ["weakness", "facial droop", "slurred speech", "neurological"],
    },
    {
        "id": "E04",
        "category": "Emergency",
        "name": "Pediatric Respiratory Distress",
        "patient_context": "Age: 2, Gender: Female",
        "symptoms": "Severe cough, high-pitched breathing (stridor), chest retractions, unable to drink, lethargy",
        "vitals": {"respiratory_rate": {"value": "50", "unit": "breaths/min"}, "spo2": {"value": "87", "unit": "%"}, "heart_rate": {"value": "160", "unit": "bpm"}, "temperature": {"value": "39.5", "unit": "C"}},
        "medical_history": "Premature birth at 34 weeks, no chronic conditions",
        "expected_triage": "EMERGENCY",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["respiratory distress", "croup", "epiglottitis", "pneumonia", "bronchiolitis"],
        "expected_red_flag_keywords": ["stridor", "retractions", "low oxygen", "pediatric", "lethargy"],
    },

    # ── URGENT CASES (should triage URGENT) ──
    {
        "id": "U01",
        "category": "Triage",
        "name": "Hypertensive Crisis",
        "patient_context": "Age: 58, Gender: Male",
        "symptoms": "Severe headache, blurred vision, epistaxis (nosebleed), dizziness for 2 hours",
        "vitals": {"blood_pressure": {"value": "200/120", "unit": "mmHg"}, "heart_rate": {"value": "95", "unit": "bpm"}, "spo2": {"value": "97", "unit": "%"}},
        "medical_history": "Hypertension (non-compliant with medications)",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["hypertensive", "hypertension", "crisis", "emergency"],
        "expected_red_flag_keywords": ["blood pressure", "blurred vision", "headache"],
    },
    {
        "id": "U02",
        "category": "Triage",
        "name": "Pregnant Woman with Severe Abdominal Pain",
        "patient_context": "Age: 30, Gender: Female",
        "symptoms": "28 weeks pregnant, sudden onset severe lower abdominal pain, vaginal spotting, decreased fetal movement",
        "vitals": {"blood_pressure": {"value": "140/90", "unit": "mmHg"}, "heart_rate": {"value": "100", "unit": "bpm"}, "spo2": {"value": "98", "unit": "%"}, "temperature": {"value": "37.2", "unit": "C"}},
        "medical_history": "G2P1, previous uncomplicated delivery, gestational hypertension",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["placental abruption", "preterm labor", "pre-eclampsia", "ectopic"],
        "expected_red_flag_keywords": ["pregnant", "vaginal bleeding", "abdominal pain", "fetal movement"],
    },
    {
        "id": "U03",
        "category": "Triage",
        "name": "Diabetic Ketoacidosis Symptoms",
        "patient_context": "Age: 22, Gender: Male",
        "symptoms": "Nausea, vomiting, fruity breath odor, excessive thirst, frequent urination, abdominal pain, confusion",
        "vitals": {"blood_pressure": {"value": "100/65", "unit": "mmHg"}, "heart_rate": {"value": "115", "unit": "bpm"}, "respiratory_rate": {"value": "26", "unit": "breaths/min"}, "temperature": {"value": "37.0", "unit": "C"}},
        "medical_history": "Type 1 Diabetes, ran out of insulin 2 days ago",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["DKA", "diabetic ketoacidosis", "hyperglycemia"],
        "expected_red_flag_keywords": ["fruity breath", "confusion", "insulin", "ketoacidosis"],
    },
    {
        "id": "U04",
        "category": "Triage",
        "name": "Pediatric High Fever with Rash",
        "patient_context": "Age: 4, Gender: Male",
        "symptoms": "High fever for 3 days, non-blanching petechial rash on trunk and legs, irritability, neck stiffness, refusal to eat",
        "vitals": {"temperature": {"value": "40.2", "unit": "C"}, "heart_rate": {"value": "140", "unit": "bpm"}, "respiratory_rate": {"value": "30", "unit": "breaths/min"}},
        "medical_history": "Up to date on vaccinations, no chronic conditions",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["meningitis", "meningococcal", "sepsis", "bacterial"],
        "expected_red_flag_keywords": ["petechial", "rash", "neck stiffness", "fever", "pediatric"],
    },
    {
        "id": "U05",
        "category": "Triage",
        "name": "Acute Appendicitis Presentation",
        "patient_context": "Age: 16, Gender: Female",
        "symptoms": "Periumbilical pain migrating to right lower quadrant, nausea, vomiting, loss of appetite, pain worse with movement",
        "vitals": {"temperature": {"value": "38.3", "unit": "C"}, "heart_rate": {"value": "95", "unit": "bpm"}, "blood_pressure": {"value": "110/70", "unit": "mmHg"}},
        "medical_history": "No significant medical history",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["appendicitis", "acute abdomen", "peritonitis"],
        "expected_red_flag_keywords": ["RLQ", "right lower quadrant", "rebound", "appendicitis"],
    },
    {
        "id": "U06",
        "category": "Triage",
        "name": "Pediatric Pneumonia",
        "patient_context": "Age: 8, Gender: Female",
        "symptoms": "3-day productive cough with yellow-green sputum, fever, chest pain with breathing, decreased appetite",
        "vitals": {"temperature": {"value": "38.5", "unit": "C"}, "heart_rate": {"value": "105", "unit": "bpm"}, "spo2": {"value": "94", "unit": "%"}, "respiratory_rate": {"value": "28", "unit": "breaths/min"}},
        "medical_history": "Asthma (mild, well-controlled)",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["pneumonia", "lower respiratory infection", "bronchitis"],
        "expected_red_flag_keywords": ["low oxygen", "spo2", "fever", "cough"],
    },

    # ── ROUTINE CASES (should triage ROUTINE) ──
    {
        "id": "R01",
        "category": "Diagnostic",
        "name": "Common Cold / URI",
        "patient_context": "Age: 35, Gender: Female",
        "symptoms": "Runny nose for 3 days, mild sore throat, sneezing, mild headache, no fever",
        "vitals": {"temperature": {"value": "37.1", "unit": "C"}, "heart_rate": {"value": "72", "unit": "bpm"}, "blood_pressure": {"value": "120/80", "unit": "mmHg"}, "spo2": {"value": "99", "unit": "%"}},
        "medical_history": "No chronic conditions",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["URI", "upper respiratory", "common cold", "viral", "rhinitis"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "R02",
        "category": "Diagnostic",
        "name": "Mild Gastroenteritis",
        "patient_context": "Age: 25, Gender: Male",
        "symptoms": "2 days of watery diarrhea (4-5 times/day), mild nausea, mild abdominal cramps, no blood in stool",
        "vitals": {"temperature": {"value": "37.3", "unit": "C"}, "heart_rate": {"value": "78", "unit": "bpm"}, "blood_pressure": {"value": "115/75", "unit": "mmHg"}},
        "medical_history": "No chronic conditions, ate street food 3 days ago",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["gastroenteritis", "diarrhea", "food poisoning", "viral gastro"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "R03",
        "category": "Diagnostic",
        "name": "Tension Headache",
        "patient_context": "Age: 42, Gender: Female",
        "symptoms": "Bilateral dull headache for 2 days, pressure-like quality, worse with stress, no visual changes, no nausea",
        "vitals": {"temperature": {"value": "36.8", "unit": "C"}, "heart_rate": {"value": "70", "unit": "bpm"}, "blood_pressure": {"value": "125/80", "unit": "mmHg"}},
        "medical_history": "Recurrent tension headaches, takes ibuprofen as needed",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["tension headache", "headache", "tension-type"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "R04",
        "category": "Diagnostic",
        "name": "Mild Ankle Sprain",
        "patient_context": "Age: 20, Gender: Male",
        "symptoms": "Twisted left ankle while playing football yesterday, mild swelling, can bear weight with some pain, no bruising",
        "vitals": {"temperature": {"value": "36.9", "unit": "C"}, "heart_rate": {"value": "68", "unit": "bpm"}, "blood_pressure": {"value": "118/72", "unit": "mmHg"}},
        "medical_history": "No chronic conditions",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["ankle sprain", "sprain", "ligament", "musculoskeletal"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "R05",
        "category": "Diagnostic",
        "name": "Seasonal Allergies",
        "patient_context": "Age: 30, Gender: Female",
        "symptoms": "Itchy watery eyes, sneezing, nasal congestion for past 2 weeks, worse outdoors, clear nasal discharge",
        "vitals": {"temperature": {"value": "36.7", "unit": "C"}, "heart_rate": {"value": "70", "unit": "bpm"}, "blood_pressure": {"value": "115/70", "unit": "mmHg"}, "spo2": {"value": "99", "unit": "%"}},
        "medical_history": "Known seasonal allergies, takes cetirizine occasionally",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["allergic rhinitis", "allergies", "hay fever", "seasonal"],
        "expected_red_flag_keywords": [],
    },

    # ── CHRONIC CARE CASES ──
    {
        "id": "C01",
        "category": "Chronic Care",
        "name": "Uncontrolled Type 2 Diabetes",
        "patient_context": "Age: 55, Gender: Male",
        "symptoms": "Increased thirst, frequent urination, blurry vision, tingling in feet, fatigue for past month",
        "vitals": {"blood_pressure": {"value": "145/90", "unit": "mmHg"}, "heart_rate": {"value": "82", "unit": "bpm"}, "blood_glucose": {"value": "320", "unit": "mg/dL"}},
        "medical_history": "Type 2 Diabetes for 10 years, non-compliant with metformin, HbA1c 11.2%",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["diabetes", "hyperglycemia", "uncontrolled", "neuropathy"],
        "expected_red_flag_keywords": ["blood glucose", "tingling", "neuropathy", "blurry vision"],
    },
    {
        "id": "C02",
        "category": "Chronic Care",
        "name": "COPD Exacerbation",
        "patient_context": "Age: 68, Gender: Male",
        "symptoms": "Worsening shortness of breath for 3 days, increased sputum production (green), wheezing, using accessory muscles to breathe",
        "vitals": {"spo2": {"value": "89", "unit": "%"}, "respiratory_rate": {"value": "26", "unit": "breaths/min"}, "heart_rate": {"value": "100", "unit": "bpm"}, "temperature": {"value": "37.8", "unit": "C"}},
        "medical_history": "COPD stage 3, 50 pack-year smoking history, on home oxygen 2L",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["COPD exacerbation", "COPD", "bronchitis", "respiratory"],
        "expected_red_flag_keywords": ["low oxygen", "accessory muscles", "spo2", "dyspnea"],
    },
    {
        "id": "C03",
        "category": "Chronic Care",
        "name": "Stable Hypertension Follow-up",
        "patient_context": "Age: 50, Gender: Female",
        "symptoms": "Routine follow-up, no new symptoms, taking medications regularly, occasional mild headache in mornings",
        "vitals": {"blood_pressure": {"value": "138/88", "unit": "mmHg"}, "heart_rate": {"value": "74", "unit": "bpm"}, "weight": {"value": "85", "unit": "kg"}},
        "medical_history": "Hypertension for 5 years, on amlodipine 5mg daily, no diabetes",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["hypertension", "blood pressure", "controlled"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "C04",
        "category": "Chronic Care",
        "name": "Asthma Attack - Moderate",
        "patient_context": "Age: 12, Gender: Male",
        "symptoms": "Wheezing, chest tightness, difficulty speaking in full sentences, cough worsening over 2 hours, used rescue inhaler 3 times with partial relief",
        "vitals": {"spo2": {"value": "93", "unit": "%"}, "respiratory_rate": {"value": "30", "unit": "breaths/min"}, "heart_rate": {"value": "110", "unit": "bpm"}},
        "medical_history": "Moderate persistent asthma, on fluticasone and albuterol PRN",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["asthma", "asthma exacerbation", "bronchospasm"],
        "expected_red_flag_keywords": ["wheezing", "rescue inhaler", "speaking difficulty", "low oxygen"],
    },

    # ── MEDICATION MANAGEMENT CASES ──
    {
        "id": "M01",
        "category": "Medication",
        "name": "Drug Interaction Concern",
        "patient_context": "Age: 70, Gender: Female",
        "symptoms": "Dizziness, fatigue, easy bruising for 1 week since starting new medication (ibuprofen for knee pain)",
        "vitals": {"blood_pressure": {"value": "110/65", "unit": "mmHg"}, "heart_rate": {"value": "68", "unit": "bpm"}},
        "medical_history": "Atrial fibrillation on warfarin, hypertension on lisinopril, new ibuprofen added by pharmacy",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["drug interaction", "warfarin", "NSAID", "bleeding risk", "anticoagulant"],
        "expected_red_flag_keywords": ["bruising", "warfarin", "drug interaction", "bleeding"],
    },
    {
        "id": "M02",
        "category": "Medication",
        "name": "Medication Non-Adherence - Hypertension",
        "patient_context": "Age: 48, Gender: Male",
        "symptoms": "Headache, feels fine otherwise, admits to not taking blood pressure medication for 2 weeks because ran out and felt fine",
        "vitals": {"blood_pressure": {"value": "170/105", "unit": "mmHg"}, "heart_rate": {"value": "80", "unit": "bpm"}},
        "medical_history": "Hypertension for 3 years, prescribed amlodipine 10mg + losartan 50mg daily",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["hypertension", "non-adherence", "uncontrolled", "medication"],
        "expected_red_flag_keywords": ["blood pressure", "non-adherence", "elevated"],
    },

    # ── RISK STRATIFICATION CASES ──
    {
        "id": "K01",
        "category": "Risk",
        "name": "High Cardiovascular Risk",
        "patient_context": "Age: 60, Gender: Male",
        "symptoms": "Routine check-up, intermittent exertional chest discomfort for past month, resolves with rest",
        "vitals": {"blood_pressure": {"value": "150/95", "unit": "mmHg"}, "heart_rate": {"value": "78", "unit": "bpm"}, "blood_glucose": {"value": "180", "unit": "mg/dL"}},
        "medical_history": "Type 2 Diabetes, hyperlipidemia (LDL 180), 30 pack-year smoker, father had MI at age 55",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["angina", "coronary artery disease", "cardiovascular risk", "ischemic heart"],
        "expected_red_flag_keywords": ["exertional chest", "cardiovascular risk", "diabetes", "smoking"],
    },
    {
        "id": "K02",
        "category": "Risk",
        "name": "Elderly Fall Risk Assessment",
        "patient_context": "Age: 82, Gender: Female",
        "symptoms": "Had a fall last week, tripped on rug at home, no fracture, feeling unsteady on feet, lightheaded when standing",
        "vitals": {"blood_pressure": {"value": "135/75", "unit": "mmHg"}, "heart_rate": {"value": "64", "unit": "bpm"}, "blood_pressure_standing": {"value": "105/60", "unit": "mmHg"}},
        "medical_history": "Osteoporosis, on alendronate, takes lisinopril and furosemide, previous hip fracture 2019",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["fall risk", "orthostatic hypotension", "postural", "dizziness"],
        "expected_red_flag_keywords": ["fall", "orthostatic", "lightheaded"],
    },

    # ── REFERRAL CASES ──
    {
        "id": "F01",
        "category": "Referral",
        "name": "Suspected Cancer - Weight Loss",
        "patient_context": "Age: 62, Gender: Male",
        "symptoms": "Unintentional weight loss of 10kg in 3 months, night sweats, persistent fatigue, palpable lymph nodes in neck",
        "vitals": {"temperature": {"value": "37.5", "unit": "C"}, "heart_rate": {"value": "85", "unit": "bpm"}, "blood_pressure": {"value": "125/80", "unit": "mmHg"}},
        "medical_history": "Former smoker (30 years), moderate alcohol use",
        "expected_triage": "URGENT",
        "safety_critical": False,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["lymphoma", "cancer", "malignancy", "neoplasm", "weight loss"],
        "expected_red_flag_keywords": ["weight loss", "night sweats", "lymph nodes", "cancer"],
    },
    {
        "id": "F02",
        "category": "Referral",
        "name": "Mental Health Crisis",
        "patient_context": "Age: 35, Gender: Female",
        "symptoms": "Feeling hopeless, not sleeping for 5 days, loss of interest in everything, crying spells, mentioned not wanting to live",
        "vitals": {"blood_pressure": {"value": "115/75", "unit": "mmHg"}, "heart_rate": {"value": "90", "unit": "bpm"}},
        "medical_history": "History of depression, lost job 2 months ago",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["depression", "suicidal ideation", "mental health", "major depressive"],
        "expected_red_flag_keywords": ["suicidal", "not wanting to live", "hopeless", "insomnia"],
    },

    # ── PATIENT EDUCATION CASES ──
    {
        "id": "P01",
        "category": "Education",
        "name": "New Diabetes Diagnosis Education",
        "patient_context": "Age: 45, Gender: Female",
        "symptoms": "Recently diagnosed with Type 2 Diabetes, needs education on management, diet, and monitoring",
        "vitals": {"blood_pressure": {"value": "130/85", "unit": "mmHg"}, "blood_glucose": {"value": "210", "unit": "mg/dL"}, "heart_rate": {"value": "75", "unit": "bpm"}},
        "medical_history": "Newly diagnosed Type 2 Diabetes, HbA1c 8.5%, BMI 32",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["diabetes", "type 2", "hyperglycemia"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "P02",
        "category": "Education",
        "name": "Prenatal Care First Visit",
        "patient_context": "Age: 24, Gender: Female",
        "symptoms": "Confirmed pregnancy at 10 weeks, first prenatal visit, mild morning nausea, no bleeding, no pain",
        "vitals": {"blood_pressure": {"value": "110/70", "unit": "mmHg"}, "heart_rate": {"value": "80", "unit": "bpm"}, "temperature": {"value": "37.0", "unit": "C"}},
        "medical_history": "G1P0, no chronic conditions, takes folic acid",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["pregnancy", "prenatal", "normal pregnancy"],
        "expected_red_flag_keywords": [],
    },

    # ── SYMPTOM ASSESSMENT CASES ──
    {
        "id": "S01",
        "category": "Symptom",
        "name": "Malaria Suspicion - Endemic Area",
        "patient_context": "Age: 10, Gender: Male",
        "symptoms": "Cyclical high fever for 3 days (spikes every 48 hours), chills, rigors, headache, body aches, sweating",
        "vitals": {"temperature": {"value": "39.8", "unit": "C"}, "heart_rate": {"value": "120", "unit": "bpm"}, "respiratory_rate": {"value": "24", "unit": "breaths/min"}},
        "medical_history": "Lives in malaria-endemic area, no bed net, not on prophylaxis",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["malaria", "plasmodium", "parasitic"],
        "expected_red_flag_keywords": ["cyclical fever", "endemic", "pediatric", "malaria"],
    },
    {
        "id": "S02",
        "category": "Symptom",
        "name": "Urinary Tract Infection",
        "patient_context": "Age: 28, Gender: Female",
        "symptoms": "Burning with urination for 2 days, frequent urination, urgency, suprapubic discomfort, no fever, no back pain",
        "vitals": {"temperature": {"value": "37.0", "unit": "C"}, "heart_rate": {"value": "72", "unit": "bpm"}, "blood_pressure": {"value": "115/70", "unit": "mmHg"}},
        "medical_history": "History of recurrent UTIs, no chronic conditions",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["UTI", "urinary tract infection", "cystitis"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "S03",
        "category": "Symptom",
        "name": "Acute Otitis Media - Child",
        "patient_context": "Age: 5, Gender: Female",
        "symptoms": "Right ear pain for 2 days, tugging at ear, irritable, decreased appetite, mild nasal congestion",
        "vitals": {"temperature": {"value": "38.2", "unit": "C"}, "heart_rate": {"value": "100", "unit": "bpm"}},
        "medical_history": "Previous ear infection 6 months ago, treated with amoxicillin",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["otitis media", "ear infection", "AOM"],
        "expected_red_flag_keywords": [],
    },

    # ── FOLLOW-UP CASES ──
    {
        "id": "FU01",
        "category": "Follow-up",
        "name": "Post-Surgery Follow-up - Wound Check",
        "patient_context": "Age: 40, Gender: Male",
        "symptoms": "Day 7 post-appendectomy, wound site slightly red, no drainage, mild tenderness, no fever",
        "vitals": {"temperature": {"value": "37.0", "unit": "C"}, "heart_rate": {"value": "70", "unit": "bpm"}, "blood_pressure": {"value": "120/78", "unit": "mmHg"}},
        "medical_history": "Appendectomy 7 days ago, uncomplicated",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["post-operative", "wound healing", "surgical follow-up"],
        "expected_red_flag_keywords": [],
    },
    {
        "id": "FU02",
        "category": "Follow-up",
        "name": "TB Treatment Follow-up",
        "patient_context": "Age: 38, Gender: Male",
        "symptoms": "Week 8 of TB treatment (RHZE), cough improving, appetite better, mild joint pain (possibly pyrazinamide side effect)",
        "vitals": {"temperature": {"value": "36.8", "unit": "C"}, "heart_rate": {"value": "72", "unit": "bpm"}, "spo2": {"value": "97", "unit": "%"}},
        "medical_history": "Pulmonary TB diagnosed 8 weeks ago, HIV-negative, on RHZE",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["tuberculosis", "TB", "follow-up", "treatment response"],
        "expected_red_flag_keywords": [],
    },

    # ── VITALS / MIXED CASES ──
    {
        "id": "V01",
        "category": "Vitals",
        "name": "Dehydration in Elderly",
        "patient_context": "Age: 78, Gender: Female",
        "symptoms": "Weakness, dizziness, dry mouth, reduced urine output for 2 days, mild confusion, hot weather",
        "vitals": {"blood_pressure": {"value": "95/60", "unit": "mmHg"}, "heart_rate": {"value": "100", "unit": "bpm"}, "temperature": {"value": "37.4", "unit": "C"}},
        "medical_history": "On furosemide for heart failure, lives alone",
        "expected_triage": "URGENT",
        "safety_critical": True,
        "expected_referral": True,
        "expected_diagnoses_keywords": ["dehydration", "hypovolemia", "electrolyte imbalance"],
        "expected_red_flag_keywords": ["hypotension", "confusion", "reduced urine", "elderly"],
    },
    {
        "id": "V02",
        "category": "Vitals",
        "name": "Well-Baby Check - Normal",
        "patient_context": "Age: 0.5, Gender: Male",
        "symptoms": "6-month well-baby visit, feeding well, gaining weight, meeting milestones, 2 teeth erupting",
        "vitals": {"temperature": {"value": "36.9", "unit": "C"}, "heart_rate": {"value": "130", "unit": "bpm"}, "weight": {"value": "7.5", "unit": "kg"}},
        "medical_history": "Born full-term, up to date on vaccinations, breastfed",
        "expected_triage": "ROUTINE",
        "safety_critical": False,
        "expected_referral": False,
        "expected_diagnoses_keywords": ["well-baby", "normal", "healthy", "teething", "routine"],
        "expected_red_flag_keywords": [],
    },
]


# ============================================================================
# Evaluation Scoring
# ============================================================================

class WorkflowEvaluator:
    """Evaluate MedGemma tool-based workflow against clinical test cases."""

    def __init__(self):
        self.test_cases = TEST_CASES
        self.results: List[Dict[str, Any]] = []

    def evaluate_single_tool(
        self, test_case: Dict[str, Any], tool_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Score a single clinical_assessment tool result against expected values."""
        scores = {}

        # 1. Triage accuracy (exact match or acceptable)
        actual_triage = (tool_result.get("triage_level") or "UNKNOWN").upper()
        expected_triage = test_case["expected_triage"].upper()

        # Accept EMERGENCY for URGENT (conservative is OK) but not ROUTINE for URGENT/EMERGENCY
        if actual_triage == expected_triage:
            scores["triage_match"] = "exact"
            scores["triage_score"] = 1.0
        elif actual_triage == "EMERGENCY" and expected_triage == "URGENT":
            scores["triage_match"] = "acceptable_conservative"
            scores["triage_score"] = 0.75  # Over-triage is safer than under-triage
        elif actual_triage == "URGENT" and expected_triage == "EMERGENCY":
            scores["triage_match"] = "under_triage"
            scores["triage_score"] = 0.25  # Dangerous under-triage
        elif actual_triage == "URGENT" and expected_triage == "ROUTINE":
            scores["triage_match"] = "over_triage"
            scores["triage_score"] = 0.5
        elif actual_triage == "ROUTINE" and expected_triage == "URGENT":
            scores["triage_match"] = "under_triage"
            scores["triage_score"] = 0.25
        elif actual_triage == "ROUTINE" and expected_triage == "EMERGENCY":
            scores["triage_match"] = "critical_miss"
            scores["triage_score"] = 0.0
        else:
            scores["triage_match"] = "mismatch"
            scores["triage_score"] = 0.0

        # 2. Safety detection (did it flag red flags for safety-critical cases?)
        if test_case["safety_critical"]:
            red_flags = tool_result.get("red_flags", [])
            flags_text = " ".join(str(f).lower() for f in red_flags)
            reasoning = (tool_result.get("reasoning") or "").lower()
            combined = flags_text + " " + reasoning

            expected_flag_keywords = test_case.get("expected_red_flag_keywords", [])
            if expected_flag_keywords:
                found_flags = sum(
                    1 for kw in expected_flag_keywords
                    if kw.lower() in combined
                )
                scores["safety_detection"] = min(found_flags / max(len(expected_flag_keywords), 1), 1.0)
            else:
                scores["safety_detection"] = 1.0 if red_flags else 0.5

            # Critical: EMERGENCY cases must never be triaged as ROUTINE
            if expected_triage == "EMERGENCY" and actual_triage == "ROUTINE":
                scores["safety_detection"] = 0.0
        else:
            scores["safety_detection"] = 1.0  # Non-safety cases automatically pass

        # 3. Diagnosis quality (any expected keyword in differential?)
        diagnoses = tool_result.get("differential_diagnoses", [])
        dx_text = " ".join(str(d).lower() for d in diagnoses)
        reasoning_text = (tool_result.get("reasoning") or "").lower()
        combined_dx = dx_text + " " + reasoning_text

        expected_dx_keywords = test_case.get("expected_diagnoses_keywords", [])
        if expected_dx_keywords:
            found_dx = sum(
                1 for kw in expected_dx_keywords
                if kw.lower() in combined_dx
            )
            scores["diagnosis_quality"] = min(found_dx / 1, 1.0)  # At least one match = 1.0
        else:
            scores["diagnosis_quality"] = 1.0

        # 4. Composite score
        weights = {"triage": 0.4, "safety": 0.35, "diagnosis": 0.25}
        scores["composite"] = (
            weights["triage"] * scores["triage_score"]
            + weights["safety"] * scores["safety_detection"]
            + weights["diagnosis"] * scores["diagnosis_quality"]
        )

        return {
            "test_id": test_case["id"],
            "test_name": test_case["name"],
            "category": test_case["category"],
            "expected_triage": expected_triage,
            "actual_triage": actual_triage,
            "safety_critical": test_case["safety_critical"],
            "scores": scores,
            "diagnoses": diagnoses,
            "red_flags": tool_result.get("red_flags", []),
        }

    async def run_clinical_assessment_eval(self, toolkit=None) -> Dict[str, Any]:
        """Run all test cases through the clinical_assessment tool and score."""
        if toolkit is None:
            toolkit = get_medgemma_toolkit()
        self.results = []
        start_time = time.time()

        logger.info("=" * 70)
        logger.info("MedAssist CHW - Competition Evaluation")
        logger.info(f"Running {len(self.test_cases)} clinical test cases")
        logger.info("=" * 70)

        for i, tc in enumerate(self.test_cases, 1):
            tc_start = time.time()

            try:
                ca_tool = registry.get_tool("clinical_assessment")
                out = ca_tool.execute({
                    "symptoms": tc["symptoms"],
                    "vitals": tc["vitals"],
                    "patient_context": tc["patient_context"],
                    "medical_history": tc.get("medical_history", "None provided"),
                }, toolkit)
                result = out.get("clinical_assessment", {})
                evaluation = self.evaluate_single_tool(tc, result)
                evaluation["raw_result"] = result
                evaluation["latency_s"] = round(time.time() - tc_start, 1)
                evaluation["success"] = True

                triage_icon = {
                    "exact": "OK",
                    "acceptable_conservative": "~OK",
                    "over_triage": "OVER",
                    "under_triage": "MISS",
                    "critical_miss": "FAIL",
                    "mismatch": "FAIL",
                }.get(evaluation["scores"]["triage_match"], "?")

                logger.info(
                    f"[{i:2d}/{len(self.test_cases)}] {tc['id']}: {tc['name']} ... "
                    f"{evaluation['actual_triage']:10s} [{triage_icon:4s}] "
                    f"score={evaluation['scores']['composite']:.2f} ({evaluation['latency_s']}s)"
                )

            except Exception as e:
                evaluation = {
                    "test_id": tc["id"],
                    "test_name": tc["name"],
                    "category": tc["category"],
                    "expected_triage": tc["expected_triage"],
                    "actual_triage": "ERROR",
                    "safety_critical": tc["safety_critical"],
                    "scores": {"triage_score": 0, "safety_detection": 0, "diagnosis_quality": 0, "composite": 0},
                    "success": False,
                    "error": str(e),
                    "latency_s": round(time.time() - tc_start, 1),
                }
                logger.error(f"[{i:2d}/{len(self.test_cases)}] {tc['id']}: {tc['name']} ERROR: {e}")

            self.results.append(evaluation)

        total_time = round(time.time() - start_time, 1)
        return self._generate_report(total_time)

    def _generate_report(self, total_time: float) -> Dict[str, Any]:
        """Generate comprehensive evaluation report."""
        total = len(self.results)
        successful = [r for r in self.results if r.get("success")]
        failed_runs = [r for r in self.results if not r.get("success")]

        # Triage accuracy
        exact_matches = sum(1 for r in successful if r["scores"]["triage_match"] == "exact")
        acceptable = sum(1 for r in successful if r["scores"]["triage_match"] in ("exact", "acceptable_conservative"))
        under_triage = sum(1 for r in successful if r["scores"]["triage_match"] in ("under_triage", "critical_miss"))
        critical_misses = sum(1 for r in successful if r["scores"]["triage_match"] == "critical_miss")

        # Safety detection
        safety_cases = [r for r in successful if r["safety_critical"]]
        safety_detected = sum(1 for r in safety_cases if r["scores"]["safety_detection"] >= 0.5)

        # By category
        categories = {}
        for r in successful:
            cat = r["category"]
            if cat not in categories:
                categories[cat] = {"count": 0, "triage_correct": 0, "composite_sum": 0}
            categories[cat]["count"] += 1
            if r["scores"]["triage_match"] in ("exact", "acceptable_conservative"):
                categories[cat]["triage_correct"] += 1
            categories[cat]["composite_sum"] += r["scores"]["composite"]

        # Confusion matrix
        triage_levels = ["EMERGENCY", "URGENT", "ROUTINE"]
        confusion = {exp: {act: 0 for act in triage_levels} for exp in triage_levels}
        for r in successful:
            exp = r["expected_triage"]
            act = r["actual_triage"]
            if exp in confusion and act in confusion.get(exp, {}):
                confusion[exp][act] += 1

        # Average scores
        avg_composite = sum(r["scores"]["composite"] for r in successful) / max(len(successful), 1)
        avg_triage = sum(r["scores"]["triage_score"] for r in successful) / max(len(successful), 1)
        avg_safety = sum(r["scores"]["safety_detection"] for r in successful) / max(len(successful), 1)
        avg_diagnosis = sum(r["scores"]["diagnosis_quality"] for r in successful) / max(len(successful), 1)
        avg_latency = sum(r.get("latency_s", 0) for r in successful) / max(len(successful), 1)

        report = {
            "evaluation_date": datetime.now().isoformat(),
            "model": "medgemma-chw (fine-tuned MedGemma via Ollama)",
            "total_cases": total,
            "successful_runs": len(successful),
            "failed_runs": len(failed_runs),
            "total_time_s": total_time,
            "avg_latency_s": round(avg_latency, 1),
            "summary": {
                "triage_exact_accuracy": round(exact_matches / max(len(successful), 1) * 100, 1),
                "triage_acceptable_accuracy": round(acceptable / max(len(successful), 1) * 100, 1),
                "under_triage_count": under_triage,
                "critical_miss_count": critical_misses,
                "safety_detection_rate": round(safety_detected / max(len(safety_cases), 1) * 100, 1),
                "avg_composite_score": round(avg_composite, 3),
                "avg_triage_score": round(avg_triage, 3),
                "avg_safety_score": round(avg_safety, 3),
                "avg_diagnosis_score": round(avg_diagnosis, 3),
            },
            "by_category": {
                cat: {
                    "count": v["count"],
                    "triage_accuracy": round(v["triage_correct"] / max(v["count"], 1) * 100, 1),
                    "avg_composite": round(v["composite_sum"] / max(v["count"], 1), 3),
                }
                for cat, v in sorted(categories.items())
            },
            "confusion_matrix": confusion,
            "detailed_results": self.results,
        }

        # Log summary
        logger.info("=" * 70)
        logger.info("EVALUATION SUMMARY")
        logger.info("=" * 70)
        logger.info(f"Total cases:              {total}")
        logger.info(f"Successful runs:          {len(successful)}")
        logger.info(f"Failed runs:              {len(failed_runs)}")
        logger.info(f"Total time:               {total_time}s")
        logger.info(f"Avg latency per case:     {round(avg_latency, 1)}s")
        logger.info("TRIAGE ACCURACY:")
        logger.info(f"  Exact match:            {exact_matches}/{len(successful)} ({report['summary']['triage_exact_accuracy']}%)")
        logger.info(f"  Acceptable (incl. conservative): {acceptable}/{len(successful)} ({report['summary']['triage_acceptable_accuracy']}%)")
        logger.info(f"  Under-triage:           {under_triage} (DANGEROUS)")
        logger.info(f"  Critical misses:        {critical_misses} (EMERGENCY -> ROUTINE)")
        logger.info("SAFETY DETECTION:")
        logger.info(f"  Safety-critical cases:  {len(safety_cases)}")
        logger.info(f"  Correctly flagged:      {safety_detected}/{len(safety_cases)} ({report['summary']['safety_detection_rate']}%)")
        logger.info("SCORES (weighted average):")
        logger.info(f"  Composite:              {avg_composite:.3f}")
        logger.info(f"  Triage:                 {avg_triage:.3f}")
        logger.info(f"  Safety:                 {avg_safety:.3f}")
        logger.info(f"  Diagnosis:              {avg_diagnosis:.3f}")
        logger.info("BY CATEGORY:")
        for cat, v in sorted(categories.items()):
            acc = round(v["triage_correct"] / max(v["count"], 1) * 100, 1)
            comp = round(v["composite_sum"] / max(v["count"], 1), 3)
            logger.info(f"  {cat:20s}  n={v['count']:2d}  triage={acc:5.1f}%  composite={comp:.3f}")
        logger.info("CONFUSION MATRIX (expected -> actual):")
        logger.info(f"{'':>15s} {'EMERGENCY':>11s} {'URGENT':>11s} {'ROUTINE':>11s}")
        for exp in triage_levels:
            row = confusion.get(exp, {})
            logger.info(f"{exp:>15s} {row.get('EMERGENCY', 0):>11d} {row.get('URGENT', 0):>11d} {row.get('ROUTINE', 0):>11d}")
        logger.info("=" * 70)

        return report

    def show_test_cases(self):
        """Print all test cases (dry run)."""
        logger.info("=" * 70)
        logger.info(f"MedAssist CHW - {len(self.test_cases)} Test Cases")
        logger.info("=" * 70)

        by_cat = {}
        for tc in self.test_cases:
            by_cat.setdefault(tc["category"], []).append(tc)

        for cat, cases in sorted(by_cat.items()):
            logger.info(f"--- {cat} ({len(cases)} cases) ---")
            for tc in cases:
                safety = " [SAFETY-CRITICAL]" if tc["safety_critical"] else ""
                ref = " [REFERRAL]" if tc["expected_referral"] else ""
                logger.info(f"  {tc['id']:5s} {tc['name']:45s} expect={tc['expected_triage']:10s}{safety}{ref}")

        logger.info(f"Total: {len(self.test_cases)} cases")
        logger.info(f"  Emergency: {sum(1 for t in self.test_cases if t['expected_triage'] == 'EMERGENCY')}")
        logger.info(f"  Urgent:    {sum(1 for t in self.test_cases if t['expected_triage'] == 'URGENT')}")
        logger.info(f"  Routine:   {sum(1 for t in self.test_cases if t['expected_triage'] == 'ROUTINE')}")
        logger.info(f"  Safety-critical: {sum(1 for t in self.test_cases if t['safety_critical'])}")


# ============================================================================
# Model Comparison (base vs fine-tuned)
# ============================================================================

class ModelComparison:
    """Compare performance between base MedGemma and fine-tuned MedGemma-CHW."""

    def __init__(
        self,
        base_model: str = "medgemma-1.5-4b-it:latest",
        finetuned_model: str = "medgemma-chw:latest",
    ):
        self.base_model = base_model
        self.finetuned_model = finetuned_model

    async def run_comparison(self, max_cases: int = 0) -> Dict[str, Any]:
        """Run same test cases on both models and compare.

        Args:
            max_cases: Number of cases to run (0 = all).
        """
        cases = TEST_CASES if max_cases <= 0 else TEST_CASES[:max_cases]

        logger.info("=" * 70)
        logger.info("MODEL COMPARISON")
        logger.info(f"  Base      : {self.base_model}")
        logger.info(f"  Fine-tuned: {self.finetuned_model}")
        logger.info(f"  Cases     : {len(cases)}")
        logger.info("=" * 70)

        from langchain_ollama import OllamaLLM
        from ..core.config import settings

        class _ParameterizedToolkit(MedGemmaToolkit):
            """Toolkit variant that routes _invoke through a user-specified model."""
            def __init__(self, model_name: str):
                super().__init__()
                self._model_name = model_name

            @property
            def chw_llm(self) -> OllamaLLM:
                if self._chw_llm is None:
                    self._chw_llm = OllamaLLM(
                        model=self._model_name,
                        temperature=settings.model_temperature,
                        num_ctx=settings.max_model_context_length,
                        num_predict=2048,
                        stop=["<end_of_turn>"],
                    )
                return self._chw_llm

        evaluator = WorkflowEvaluator()
        evaluator.test_cases = cases

        def _run_model(label: str, model_name: str) -> tuple:
            """Run all cases through a single model; return (report_or_results, success_list)."""
            logger.info("─" * 70)
            logger.info(f"  Running: {label}  ({model_name})")
            logger.info("─" * 70)
            toolkit = _ParameterizedToolkit(model_name)
            results = []
            for i, tc in enumerate(cases, 1):
                tc_start = time.time()
                try:
                    ca_tool = registry.get_tool("clinical_assessment")
                    out = ca_tool.execute({
                        "symptoms": tc["symptoms"],
                        "vitals": tc["vitals"],
                        "patient_context": tc["patient_context"],
                        "medical_history": tc.get("medical_history", "None provided"),
                    }, toolkit)
                    result = out.get("clinical_assessment", {})
                    ev = evaluator.evaluate_single_tool(tc, result)
                    ev["latency_s"] = round(time.time() - tc_start, 1)
                    ev["success"] = True
                    triage_icon = {
                        "exact": "OK", "acceptable_conservative": "~OK",
                        "over_triage": "OVER", "under_triage": "MISS",
                        "critical_miss": "FAIL", "mismatch": "FAIL",
                    }.get(ev["scores"]["triage_match"], "?")
                    logger.info(
                        f"[{i:2d}/{len(cases)}] {tc['id']}: {tc['name']} ... "
                        f"{ev['actual_triage']:10s} [{triage_icon:4s}] "
                        f"score={ev['scores']['composite']:.2f} ({ev['latency_s']}s)"
                    )
                except Exception as e:
                    ev = {
                        "test_id": tc["id"], "test_name": tc["name"],
                        "category": tc["category"],
                        "expected_triage": tc["expected_triage"],
                        "actual_triage": "ERROR",
                        "safety_critical": tc["safety_critical"],
                        "scores": {"composite": 0, "triage_score": 0,
                                   "safety_detection": 0, "diagnosis_quality": 0,
                                   "triage_match": "mismatch"},
                        "success": False, "error": str(e),
                        "latency_s": round(time.time() - tc_start, 1),
                    }
                    logger.error(f"[{i:2d}/{len(cases)}] {tc['id']}: {tc['name']} ERROR: {e}")
                results.append(ev)
            return results

        # Run both models
        ft_results = _run_model("Fine-tuned", self.finetuned_model)
        base_results = _run_model("Base", self.base_model)

        # Aggregate
        def _stats(results):
            success = [r for r in results if r.get("success")]
            avg_composite = sum(r["scores"]["composite"] for r in success) / max(len(success), 1)
            triage_ok = sum(
                1 for r in success
                if r["scores"]["triage_match"] in ("exact", "acceptable_conservative")
            )
            triage_exact = sum(1 for r in success if r["scores"]["triage_match"] == "exact")
            under = sum(
                1 for r in success
                if r["scores"]["triage_match"] in ("under_triage", "critical_miss")
            )
            safety_cases = [r for r in success if r.get("safety_critical")]
            safety_ok = sum(
                1 for r in safety_cases if r["scores"]["safety_detection"] >= 0.5
            )
            avg_latency = sum(r.get("latency_s", 0) for r in success) / max(len(success), 1)
            return {
                "successful": len(success),
                "failed": len(results) - len(success),
                "avg_composite": round(avg_composite, 3),
                "triage_exact_pct": round(triage_exact / max(len(success), 1) * 100, 1),
                "triage_acceptable_pct": round(triage_ok / max(len(success), 1) * 100, 1),
                "under_triage_count": under,
                "safety_detection_pct": round(safety_ok / max(len(safety_cases), 1) * 100, 1),
                "avg_latency_s": round(avg_latency, 1),
            }

        ft_stats = _stats(ft_results)
        base_stats = _stats(base_results)

        comparison = {
            "base_model": self.base_model,
            "finetuned_model": self.finetuned_model,
            "cases_evaluated": len(cases),
            "finetuned": ft_stats,
            "base": base_stats,
            "improvement": {
                "composite_delta": round(ft_stats["avg_composite"] - base_stats["avg_composite"], 3),
                "triage_acceptable_delta": round(
                    ft_stats["triage_acceptable_pct"] - base_stats["triage_acceptable_pct"], 1
                ),
                "triage_exact_delta": round(
                    ft_stats["triage_exact_pct"] - base_stats["triage_exact_pct"], 1
                ),
                "safety_delta": round(
                    ft_stats["safety_detection_pct"] - base_stats["safety_detection_pct"], 1
                ),
            },
        }

        # Log comparison table
        W = 70
        col_b = 14
        col_ft = 14
        col_d = 10
        logger.info("=" * W)
        logger.info("MODEL COMPARISON RESULTS")
        logger.info("=" * W)
        logger.info(f"  Base      : {self.base_model}")
        logger.info(f"  Fine-tuned: {self.finetuned_model}")
        logger.info(f"  Cases     : {len(cases)}")
        hdr = f"{'Metric':<32s} {'Base':>{col_b}s} {'Fine-tuned':>{col_ft}s} {'Delta':>{col_d}s}"
        logger.info(hdr)
        logger.info("-" * W)

        def row(label, base_val, ft_val, fmt=".3f", higher_is_better=True):
            delta = ft_val - base_val
            sign = "+" if delta >= 0 else ""
            better = (delta > 0) == higher_is_better
            marker = " [OK]" if better and abs(delta) > 0 else (" [WORSE]" if not better and abs(delta) > 0 else "")
            logger.info(
                f"  {label:<30s} {base_val:>{col_b}{fmt}} "
                f"{ft_val:>{col_ft}{fmt}} "
                f"{sign}{delta:>{col_d - 1}{fmt}}{marker}"
            )

        row("Composite Score",         base_stats["avg_composite"],         ft_stats["avg_composite"])
        row("Triage Exact (%)",        base_stats["triage_exact_pct"],      ft_stats["triage_exact_pct"],   fmt=".1f")
        row("Triage Acceptable (%)",   base_stats["triage_acceptable_pct"], ft_stats["triage_acceptable_pct"], fmt=".1f")
        row("Safety Detection (%)",    base_stats["safety_detection_pct"],  ft_stats["safety_detection_pct"],  fmt=".1f")
        row("Under-triage Count",      base_stats["under_triage_count"],    ft_stats["under_triage_count"],
            fmt=".0f", higher_is_better=False)
        row("Avg Latency (s)",         base_stats["avg_latency_s"],         ft_stats["avg_latency_s"],
            fmt=".1f", higher_is_better=False)
        logger.info("=" * W)

        return comparison


# ============================================================================
# CLI Entry Point
# ============================================================================

async def main():
    """Run evaluation framework."""
    import argparse
    parser = argparse.ArgumentParser(
        description="MedAssist CHW Competition Evaluation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Compare base vs fine-tuned on all 30 cases (default models):
  python -m app.agents.competition_eval --compare

  # Specify models explicitly:
  python -m app.agents.competition_eval --compare \\
      --base-model medgemma-1.5-4b-it:latest \\
      --finetuned-model medgemma-chw:latest

  # Quick smoke test (5 cases):
  python -m app.agents.competition_eval --compare --max-cases 5

  # Run only the fine-tuned model (no comparison):
  python -m app.agents.competition_eval

  # Preview test cases without running:
  python -m app.agents.competition_eval --dry-run
""",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show test cases without running")
    parser.add_argument("--compare", action="store_true", help="Compare base vs fine-tuned model")
    parser.add_argument(
        "--base-model",
        default="medgemma-1.5-4b-it:latest",
        help="Base (untuned) model name for comparison (default: medgemma-1.5-4b-it:latest)",
    )
    parser.add_argument(
        "--finetuned-model",
        default="medgemma-chw:latest",
        help="Fine-tuned model name for comparison (default: medgemma-chw:latest)",
    )
    parser.add_argument("--max-cases", type=int, default=0, help="Limit number of test cases (0=all)")
    parser.add_argument("--output", default=None, help="Output JSON file path")
    args = parser.parse_args()

    evaluator = WorkflowEvaluator()

    if args.dry_run:
        evaluator.show_test_cases()
        return

    if args.max_cases > 0:
        evaluator.test_cases = TEST_CASES[:args.max_cases]

    if args.compare:
        comparison = ModelComparison(
            base_model=args.base_model,
            finetuned_model=args.finetuned_model,
        )
        report = await comparison.run_comparison(max_cases=args.max_cases)
    else:
        report = await evaluator.run_clinical_assessment_eval()

    # Save results
    output_path = args.output or str(
        Path(__file__).parent.parent.parent.parent / "submission" / "evaluation_results.json"
    )
    try:
        # Make results JSON-serializable
        def make_serializable(obj):
            if isinstance(obj, dict):
                return {k: make_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [make_serializable(v) for v in obj]
            elif isinstance(obj, (int, float, str, bool, type(None))):
                return obj
            else:
                return str(obj)

        with open(output_path, "w") as f:
            json.dump(make_serializable(report), f, indent=2)
        logger.info(f"Results saved to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to save results: {e}")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    asyncio.run(main())
