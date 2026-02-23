"""
Tool-Aligned Synthetic Dataset Generator for MedGemma Fine-Tuning

Generates training data that EXACTLY matches the JSON schemas expected
by the 6 tools in medgemma_tools.py:

1. clinical_assessment  -> triage_level, differential_diagnoses, red_flags, recommended_investigations
2. generate_soap_note   -> subjective, objective, assessment, plan
3. treatment_advisor    -> medications[{name,dose,frequency}], care_plan_goals[]
4. risk_assessor        -> risk_level, risk_factors, chronic_conditions, recommendations
5. referral_advisor     -> referral_needed, referral_type, referral_urgency
6. emergency_protocol   -> emergency_level, immediate_actions, call_for_help, monitoring

Usage:
    python generate_tool_aligned_dataset.py [--train-count 1000] [--test-count 120]
"""

import json
import random
import argparse
from pathlib import Path
from typing import List, Dict, Any


# =============================================================================
# Tool 1: Clinical Assessment
# =============================================================================

CLINICAL_ASSESSMENT_SCENARIOS = [
    # EMERGENCY scenarios
    {
        "context": "58-year-old male, diabetic, smoker",
        "symptoms": "crushing chest pain radiating to left arm, diaphoresis, nausea",
        "vitals": {"bp": "160/95", "hr": 110, "rr": 22, "spo2": 94, "temp": 37.0},
        "history": "Type 2 diabetes, hypertension, 30 pack-year smoking",
        "response": {
            "triage_level": "EMERGENCY",
            "differential_diagnoses": ["Acute myocardial infarction", "Unstable angina", "Aortic dissection"],
            "red_flags": ["Chest pain with radiation", "Diaphoresis", "Tachycardia", "Hypoxia"],
            "recommended_investigations": ["12-lead ECG", "Troponin", "Chest X-ray", "CBC"]
        }
    },
    {
        "context": "45-year-old female, no significant history",
        "symptoms": "worst headache of life, sudden onset, photophobia, neck stiffness",
        "vitals": {"bp": "180/110", "hr": 95, "rr": 20, "spo2": 98, "temp": 38.5},
        "history": "None significant",
        "response": {
            "triage_level": "EMERGENCY",
            "differential_diagnoses": ["Subarachnoid hemorrhage", "Meningitis", "Hypertensive emergency"],
            "red_flags": ["Thunderclap headache", "Neck stiffness", "Fever", "Hypertensive crisis"],
            "recommended_investigations": ["CT head", "Lumbar puncture", "Blood cultures", "CBC"]
        }
    },
    {
        "context": "70-year-old male with atrial fibrillation",
        "symptoms": "sudden right-sided weakness, facial droop, slurred speech, onset 1 hour ago",
        "vitals": {"bp": "175/100", "hr": 88, "rr": 18, "spo2": 96, "temp": 36.8},
        "history": "Atrial fibrillation, type 2 diabetes",
        "response": {
            "triage_level": "EMERGENCY",
            "differential_diagnoses": ["Ischemic stroke", "Hemorrhagic stroke", "TIA"],
            "red_flags": ["Focal neurological deficit", "Sudden onset", "Known AFib"],
            "recommended_investigations": ["CT head without contrast", "CT angiography", "Blood glucose", "Coagulation studies"]
        }
    },
    {
        "context": "35-year-old female with asthma",
        "symptoms": "severe shortness of breath, wheezing, can only speak in short phrases",
        "vitals": {"bp": "140/90", "hr": 120, "rr": 32, "spo2": 88, "temp": 36.6},
        "history": "Asthma since childhood, previous ICU admission",
        "response": {
            "triage_level": "EMERGENCY",
            "differential_diagnoses": ["Severe asthma exacerbation", "Pneumothorax", "Anaphylaxis"],
            "red_flags": ["Severe hypoxia", "Tachypnea", "Cannot complete sentences", "Tachycardia"],
            "recommended_investigations": ["Peak flow", "ABG", "Chest X-ray", "CBC"]
        }
    },
    {
        "context": "2-year-old child with fever",
        "symptoms": "high fever, rash, lethargy, poor feeding for 12 hours",
        "vitals": {"hr": 170, "rr": 40, "temp": 40.2, "spo2": 93},
        "history": "Previously healthy, vaccinations up to date",
        "response": {
            "triage_level": "EMERGENCY",
            "differential_diagnoses": ["Meningococcal sepsis", "Bacterial meningitis", "Severe viral illness"],
            "red_flags": ["High fever in young child", "Rash with fever", "Lethargy", "Tachycardia"],
            "recommended_investigations": ["Blood cultures", "CBC", "CRP", "Lumbar puncture"]
        }
    },
    # URGENT scenarios
    {
        "context": "22-year-old male, previously healthy",
        "symptoms": "right lower quadrant abdominal pain, nausea, low-grade fever",
        "vitals": {"bp": "125/80", "hr": 95, "rr": 18, "spo2": 99, "temp": 38.1},
        "history": "No prior surgeries",
        "response": {
            "triage_level": "URGENT",
            "differential_diagnoses": ["Acute appendicitis", "Mesenteric lymphadenitis", "Gastroenteritis"],
            "red_flags": ["RLQ pain with fever", "Rebound tenderness"],
            "recommended_investigations": ["CBC with differential", "CRP", "Urinalysis", "Abdominal ultrasound"]
        }
    },
    {
        "context": "28-year-old female, no medications",
        "symptoms": "unable to keep fluids down for 24 hours, dizziness when standing",
        "vitals": {"bp": "100/60", "hr": 110, "rr": 18, "spo2": 99, "temp": 37.2},
        "history": "None",
        "response": {
            "triage_level": "URGENT",
            "differential_diagnoses": ["Viral gastroenteritis with dehydration", "Pregnancy", "Diabetic ketoacidosis"],
            "red_flags": ["Orthostatic hypotension", "Tachycardia", "24-hour fluid intolerance"],
            "recommended_investigations": ["BMP", "Urinalysis", "Pregnancy test", "Blood glucose"]
        }
    },
    {
        "context": "65-year-old female with diabetes",
        "symptoms": "painful swollen left calf for 2 days, recent hip surgery 1 week ago",
        "vitals": {"bp": "135/85", "hr": 88, "rr": 16, "spo2": 97, "temp": 37.4},
        "history": "Type 2 diabetes, recent hip replacement",
        "response": {
            "triage_level": "URGENT",
            "differential_diagnoses": ["Deep vein thrombosis", "Cellulitis", "Post-surgical edema"],
            "red_flags": ["Unilateral calf swelling", "Recent surgery", "DVT risk factors"],
            "recommended_investigations": ["D-dimer", "Doppler ultrasound of left leg", "CBC", "CRP"]
        }
    },
    {
        "context": "40-year-old male, construction worker",
        "symptoms": "severe back pain after lifting, pain radiating down left leg, numbness in foot",
        "vitals": {"bp": "150/90", "hr": 85, "rr": 18, "spo2": 99, "temp": 36.8},
        "history": "Previous back strain 2 years ago",
        "response": {
            "triage_level": "URGENT",
            "differential_diagnoses": ["Lumbar disc herniation", "Sciatica", "Cauda equina syndrome"],
            "red_flags": ["Neurological deficit", "Foot numbness", "Radiculopathy"],
            "recommended_investigations": ["Neurological exam", "Straight leg raise", "MRI lumbar spine", "Urinalysis"]
        }
    },
    {
        "context": "50-year-old female, postmenopausal",
        "symptoms": "vaginal bleeding for 3 days, last period 2 years ago",
        "vitals": {"bp": "130/80", "hr": 78, "rr": 16, "spo2": 99, "temp": 36.9},
        "history": "Menopause at age 48, no HRT",
        "response": {
            "triage_level": "URGENT",
            "differential_diagnoses": ["Endometrial cancer", "Endometrial hyperplasia", "Cervical polyp", "Atrophic vaginitis"],
            "red_flags": ["Post-menopausal bleeding"],
            "recommended_investigations": ["Transvaginal ultrasound", "Endometrial biopsy", "CBC", "Pap smear"]
        }
    },
    # ROUTINE scenarios
    {
        "context": "55-year-old female with type 2 diabetes",
        "symptoms": "routine follow-up, reports stable blood sugars, no new complaints",
        "vitals": {"bp": "130/80", "hr": 75, "rr": 16, "spo2": 99, "temp": 36.7},
        "history": "Type 2 diabetes x 5 years, on metformin",
        "response": {
            "triage_level": "ROUTINE",
            "differential_diagnoses": ["Well-controlled type 2 diabetes"],
            "red_flags": [],
            "recommended_investigations": ["HbA1c", "Fasting lipid panel", "Renal function", "Urine microalbumin"]
        }
    },
    {
        "context": "30-year-old male, otherwise healthy",
        "symptoms": "dry cough for 3 days, no fever, no SOB, eating and drinking normally",
        "vitals": {"bp": "120/75", "hr": 70, "rr": 14, "spo2": 99, "temp": 36.8},
        "history": "None",
        "response": {
            "triage_level": "ROUTINE",
            "differential_diagnoses": ["Viral upper respiratory infection", "Post-nasal drip", "Allergic rhinitis"],
            "red_flags": [],
            "recommended_investigations": ["None required at this time"]
        }
    },
    {
        "context": "42-year-old female, office worker",
        "symptoms": "mild knee pain when climbing stairs for 2 months, no swelling",
        "vitals": {"bp": "118/76", "hr": 72, "rr": 14, "spo2": 99, "temp": 36.7},
        "history": "BMI 28, sedentary lifestyle",
        "response": {
            "triage_level": "ROUTINE",
            "differential_diagnoses": ["Patellofemoral syndrome", "Early osteoarthritis", "Meniscal wear"],
            "red_flags": [],
            "recommended_investigations": ["Knee X-ray", "Physical examination"]
        }
    },
    {
        "context": "60-year-old male with hypertension",
        "symptoms": "routine blood pressure check, reports occasional mild headaches",
        "vitals": {"bp": "142/88", "hr": 75, "rr": 16, "spo2": 98, "temp": 36.6},
        "history": "Hypertension x 10 years, on amlodipine 5mg",
        "response": {
            "triage_level": "ROUTINE",
            "differential_diagnoses": ["Uncontrolled hypertension", "Tension headache"],
            "red_flags": [],
            "recommended_investigations": ["BMP", "Lipid panel", "ECG", "Urine microalbumin"]
        }
    },
    {
        "context": "25-year-old female, presenting for annual checkup",
        "symptoms": "no complaints, feels well, wants routine screening",
        "vitals": {"bp": "115/72", "hr": 68, "rr": 14, "spo2": 99, "temp": 36.6},
        "history": "None, non-smoker",
        "response": {
            "triage_level": "ROUTINE",
            "differential_diagnoses": ["Healthy patient - preventive care"],
            "red_flags": [],
            "recommended_investigations": ["CBC", "Metabolic panel", "Lipid panel", "Pap smear"]
        }
    },
]


def generate_clinical_assessment(scenario: Dict) -> Dict:
    """Generate a single clinical assessment training example."""
    instruction = (
        f"PATIENT: {scenario['context']}, "
        f"SYMPTOMS: {scenario['symptoms']}, "
        f"VITALS: {json.dumps(scenario['vitals'])}, "
        f"HISTORY: {scenario['history']}\n\n"
        'Return JSON only: {"triage_level": "EMERGENCY|URGENT|ROUTINE", '
        '"differential_diagnoses": ["dx1","dx2"], '
        '"red_flags": ["flag1"], '
        '"recommended_investigations": ["test1"]}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "clinical_assessment",
    }


# =============================================================================
# Tool 2: SOAP Note Generator
# =============================================================================

SOAP_NOTE_SCENARIOS = [
    {
        "encounter": "55yo female with diabetes presents for routine follow-up. Reports stable blood sugars, occasional fatigue. On metformin 1000mg BID.",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Well-controlled T2DM"]},
        "treatment": {"medications": [{"name": "Metformin", "dose": "1000mg", "frequency": "BID"}]},
        "response": {
            "subjective": "55yo female with T2DM presents for routine follow-up. Reports stable blood sugars averaging 130-150 mg/dL. Occasional mild fatigue, no polyuria or polydipsia. Adherent to metformin.",
            "objective": "BP 130/80, HR 75, BMI 28. Alert and oriented. No peripheral edema. Foot exam: intact sensation, no lesions.",
            "assessment": "Type 2 diabetes mellitus, well-controlled on current regimen. Fatigue may be related to suboptimal glycemic control or other causes.",
            "plan": "Continue metformin 1000mg BID. Order HbA1c, fasting lipid panel, renal function, urine microalbumin. Reinforce diet and exercise. Follow-up in 3 months."
        }
    },
    {
        "encounter": "22yo male presents with 2-day history of sore throat, fever, difficulty swallowing. No cough.",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Streptococcal pharyngitis", "Viral pharyngitis"]},
        "treatment": None,
        "response": {
            "subjective": "22yo male presents with sore throat x2 days. Reports fever to 38.5C, odynophagia, and malaise. Denies cough, rhinorrhea, or rash. No sick contacts. No allergies.",
            "objective": "Temp 38.3C, HR 82. Pharynx erythematous with tonsillar exudates bilaterally. Anterior cervical lymphadenopathy. No rash. Lungs clear.",
            "assessment": "Acute pharyngitis, likely streptococcal given exudates and lymphadenopathy without cough (Centor score 3).",
            "plan": "Rapid strep test performed. If positive, prescribe amoxicillin 500mg TID x10 days. Supportive care with acetaminophen for pain/fever. Return if symptoms worsen or persist beyond 5 days."
        }
    },
    {
        "encounter": "68yo male presents with worsening shortness of breath on exertion over 3 weeks. History of CHF.",
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["CHF exacerbation", "Pneumonia", "COPD exacerbation"]},
        "treatment": {"medications": [{"name": "Furosemide", "dose": "40mg", "frequency": "daily"}]},
        "response": {
            "subjective": "68yo male with known CHF (EF 35%) reports progressive dyspnea on exertion x3 weeks. Now SOB walking one block. Reports 5-lb weight gain, increased ankle swelling, and 2-pillow orthopnea. Compliant with furosemide 40mg daily.",
            "objective": "BP 145/90, HR 92, RR 22, SpO2 93% RA. JVD present. Bilateral crackles at lung bases. 2+ pitting edema bilateral lower extremities. S3 gallop on cardiac exam.",
            "assessment": "Acute decompensated heart failure with volume overload. Evidence of fluid retention despite current diuretic dose.",
            "plan": "Increase furosemide to 80mg daily. Daily weights and strict fluid restriction to 1.5L. Order BNP, BMP, chest X-ray, echocardiogram. Refer to cardiology urgently. Return immediately if worsening SOB or chest pain."
        }
    },
    {
        "encounter": "8-month-old infant brought in by mother for fever x2 days, poor feeding, irritability.",
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["Otitis media", "UTI", "Viral illness"]},
        "treatment": None,
        "response": {
            "subjective": "8-month-old male brought by mother for fever x2 days (max 39.2C). Decreased oral intake, taking only half of usual bottle feeds. Irritable but consolable. No vomiting, diarrhea, or rash. Vaccinations up to date.",
            "objective": "Temp 38.8C, HR 155, RR 36. Fussy but consolable. Right TM bulging and erythematous. Throat clear. Lungs clear. Abdomen soft. No rash or petechiae.",
            "assessment": "Acute right otitis media with associated fever and decreased feeding in infant.",
            "plan": "Amoxicillin 90mg/kg/day divided BID x10 days. Acetaminophen 15mg/kg q4-6h PRN fever. Push oral fluids. Return in 48-72 hours if no improvement or sooner if worsening."
        }
    },
    {
        "encounter": "45yo female presents with 6-month history of fatigue, weight gain, constipation, cold intolerance.",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Hypothyroidism", "Depression", "Anemia"]},
        "treatment": None,
        "response": {
            "subjective": "45yo female reports progressive fatigue x6 months, 10-lb unintentional weight gain, constipation, cold intolerance, and dry skin. Denies mood changes or significant stressors. No family history of thyroid disease.",
            "objective": "BP 125/82, HR 58, Temp 36.2C. Mild periorbital puffiness. Thyroid palpably enlarged, smooth, non-tender. Skin dry. DTRs with delayed relaxation phase. No goiter nodules.",
            "assessment": "Signs and symptoms highly suggestive of hypothyroidism. Bradycardia, weight gain, cold intolerance, and delayed DTR relaxation support clinical suspicion.",
            "plan": "Order TSH and free T4 stat. CBC, lipid panel, BMP. If TSH elevated/free T4 low, initiate levothyroxine 50mcg daily. Recheck TSH in 6-8 weeks. Refer to endocrinology if autoimmune etiology suspected."
        }
    },
]


def generate_soap_note(scenario: Dict) -> Dict:
    """Generate a single SOAP note training example."""
    instruction = (
        f"ENCOUNTER: {scenario['encounter']}\n"
        f"ASSESSMENT: {json.dumps(scenario['assessment'])}\n"
        f"TREATMENT: {json.dumps(scenario['treatment']) if scenario['treatment'] else 'Not yet available'}\n\n"
        'Return JSON only: {"subjective": "brief", "objective": "brief", "assessment": "brief", "plan": "brief"}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "soap_note",
    }


# =============================================================================
# Tool 3: Treatment Advisor
# =============================================================================

TREATMENT_SCENARIOS = [
    {
        "diagnosis": "Type 2 diabetes mellitus, poorly controlled",
        "profile": "55yo female, BMI 32, no allergies, currently on metformin 1000mg BID",
        "response": {
            "medications": [
                {"name": "Metformin", "dose": "1000mg", "frequency": "BID"},
                {"name": "Glipizide", "dose": "5mg", "frequency": "daily before breakfast"}
            ],
            "care_plan_goals": [
                "Achieve HbA1c below 7% within 3 months",
                "Daily blood glucose monitoring before meals",
                "30 minutes moderate exercise 5 days per week",
                "Dietary counseling referral for diabetic diet"
            ]
        }
    },
    {
        "diagnosis": "Essential hypertension, stage 2",
        "profile": "48yo male, smoker, no drug allergies, BMI 30, no current medications",
        "response": {
            "medications": [
                {"name": "Amlodipine", "dose": "5mg", "frequency": "once daily"},
                {"name": "Lisinopril", "dose": "10mg", "frequency": "once daily"}
            ],
            "care_plan_goals": [
                "Target BP below 130/80 mmHg within 3 months",
                "Smoking cessation counseling and NRT",
                "DASH diet education",
                "Home BP monitoring twice daily",
                "Weight loss target 5% in 6 months"
            ]
        }
    },
    {
        "diagnosis": "Community-acquired pneumonia",
        "profile": "60yo male, penicillin allergy (rash), COPD, on tiotropium inhaler",
        "response": {
            "medications": [
                {"name": "Azithromycin", "dose": "500mg", "frequency": "day 1, then 250mg daily x4 days"},
                {"name": "Acetaminophen", "dose": "500mg", "frequency": "q6h PRN fever"}
            ],
            "care_plan_goals": [
                "Complete full antibiotic course",
                "Monitor temperature and oxygen saturation",
                "Push oral fluids to 2L daily",
                "Follow-up chest X-ray in 6 weeks",
                "Return if worsening SOB or fever not improving in 48 hours"
            ]
        }
    },
    {
        "diagnosis": "Major depressive disorder, moderate",
        "profile": "35yo female, no allergies, no current medications, history of anxiety",
        "response": {
            "medications": [
                {"name": "Sertraline", "dose": "50mg", "frequency": "once daily in morning"}
            ],
            "care_plan_goals": [
                "PHQ-9 reassessment in 4 weeks",
                "Referral to cognitive behavioral therapy",
                "Regular sleep schedule and sleep hygiene education",
                "30 minutes daily exercise",
                "Safety plan discussed - call 988 if suicidal thoughts"
            ]
        }
    },
    {
        "diagnosis": "Acute otitis media, right ear",
        "profile": "3yo male, weight 15kg, no allergies, previously healthy",
        "response": {
            "medications": [
                {"name": "Amoxicillin", "dose": "45mg/kg/day (340mg)", "frequency": "BID x10 days"},
                {"name": "Ibuprofen", "dose": "100mg (7mg/kg)", "frequency": "q6-8h PRN pain/fever"}
            ],
            "care_plan_goals": [
                "Complete full 10-day antibiotic course",
                "Pain management with ibuprofen as needed",
                "Push oral fluids",
                "Follow-up in 48-72 hours if no improvement",
                "Ear recheck in 4 weeks"
            ]
        }
    },
    {
        "diagnosis": "Iron deficiency anemia",
        "profile": "32yo female, vegetarian, heavy menstrual periods, no allergies",
        "response": {
            "medications": [
                {"name": "Ferrous sulfate", "dose": "325mg", "frequency": "once daily on empty stomach with vitamin C"},
            ],
            "care_plan_goals": [
                "Recheck CBC and ferritin in 8 weeks",
                "Dietary counseling for iron-rich foods",
                "Gynecology referral for menorrhagia evaluation",
                "Avoid taking iron with calcium, coffee, or tea"
            ]
        }
    },
]


def generate_treatment_advisor(scenario: Dict) -> Dict:
    """Generate a single treatment advisor training example."""
    instruction = (
        f"DIAGNOSIS: {scenario['diagnosis']}, "
        f"PATIENT: {scenario['profile']}\n\n"
        'Return JSON only: {"medications": [{"name": "drug", "dose": "amt", "frequency": "freq"}], '
        '"care_plan_goals": ["goal1", "goal2"]}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "treatment_advisor",
    }


# =============================================================================
# Tool 4: Risk Assessor
# =============================================================================

RISK_SCENARIOS = [
    {
        "patient_data": "72yo male, BMI 32, smoker, sedentary lifestyle",
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["CHF exacerbation"]},
        "history": "CHF EF 35%, T2DM, COPD, recent hospitalization 3 weeks ago",
        "response": {
            "risk_level": "HIGH",
            "risk_factors": ["Recent hospitalization", "Multiple comorbidities", "Reduced ejection fraction", "Smoking", "Obesity"],
            "chronic_conditions": ["Heart failure", "Type 2 diabetes", "COPD"],
            "recommendations": ["Close follow-up within 7 days", "Medication reconciliation", "Home health referral", "Daily weight monitoring", "Smoking cessation program"]
        }
    },
    {
        "patient_data": "55yo male, BP 145/90, total cholesterol 240, HDL 35, smoker",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Hypertension", "Dyslipidemia"]},
        "history": "No prior cardiovascular events, family history of MI in father at age 52",
        "response": {
            "risk_level": "HIGH",
            "risk_factors": ["Hypertension", "Dyslipidemia", "Smoking", "Low HDL", "Family history of early CAD"],
            "chronic_conditions": ["Hypertension", "Dyslipidemia"],
            "recommendations": ["Statin therapy initiation", "Blood pressure control target <130/80", "Smoking cessation", "DASH diet and exercise program", "10-year ASCVD risk calculation"]
        }
    },
    {
        "patient_data": "78yo female, history of falls, uses walker, takes zolpidem",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Fall risk assessment"]},
        "history": "2 falls in past 6 months, osteoporosis, vision impairment, sedative use",
        "response": {
            "risk_level": "HIGH",
            "risk_factors": ["Previous falls", "Gait instability", "Sedating medication use", "Vision impairment", "Osteoporosis"],
            "chronic_conditions": ["Osteoporosis", "Visual impairment"],
            "recommendations": ["Home safety evaluation", "Taper and discontinue zolpidem", "Ophthalmology referral", "Physical therapy for balance training", "Vitamin D 1000 IU daily", "Consider hip protectors"]
        }
    },
    {
        "patient_data": "45yo female, BMI 24, non-smoker, active lifestyle",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Preventive care visit"]},
        "history": "No chronic conditions, family history of breast cancer in mother",
        "response": {
            "risk_level": "LOW",
            "risk_factors": ["Family history of breast cancer"],
            "chronic_conditions": [],
            "recommendations": ["Continue annual screening", "Mammogram per guidelines", "Maintain healthy lifestyle", "Genetic counseling referral given family history"]
        }
    },
    {
        "patient_data": "65yo male, diabetic, CKD stage 3, on insulin and lisinopril",
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Diabetic nephropathy progression"]},
        "history": "T2DM x 15 years, CKD stage 3 (eGFR 45), microalbuminuria, retinopathy",
        "response": {
            "risk_level": "MODERATE",
            "risk_factors": ["Progressive CKD", "Diabetic complications", "Microalbuminuria", "Long-standing diabetes"],
            "chronic_conditions": ["Type 2 diabetes", "Chronic kidney disease stage 3", "Diabetic retinopathy"],
            "recommendations": ["Nephrology follow-up every 3 months", "Strict glycemic control HbA1c <7%", "Blood pressure target <130/80", "Annual ophthalmology exam", "Avoid nephrotoxic medications"]
        }
    },
]


def generate_risk_assessor(scenario: Dict) -> Dict:
    """Generate a single risk assessor training example."""
    instruction = (
        f"PATIENT: {scenario['patient_data']}, "
        f"ASSESSMENT: {json.dumps(scenario['assessment'])}, "
        f"HISTORY: {scenario['history']}\n\n"
        'Return JSON only: {"risk_level": "HIGH|MODERATE|LOW", "risk_factors": ["factor1"], '
        '"chronic_conditions": ["condition1"], "recommendations": ["rec1"]}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "risk_assessor",
    }


# =============================================================================
# Tool 5: Referral Advisor
# =============================================================================

REFERRAL_SCENARIOS = [
    {
        "assessment": {"triage_level": "EMERGENCY", "differential_diagnoses": ["Acute MI"], "red_flags": ["Chest pain", "Diaphoresis"]},
        "facilities": "General Hospital, Regional Medical Center",
        "response": {
            "referral_needed": True,
            "referral_type": "Emergency Medicine / Cardiology",
            "referral_urgency": "IMMEDIATE"
        }
    },
    {
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["Acute appendicitis"], "red_flags": ["RLQ pain with fever"]},
        "facilities": "District Hospital, Surgical Center",
        "response": {
            "referral_needed": True,
            "referral_type": "General Surgery",
            "referral_urgency": "URGENT"
        }
    },
    {
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Uncontrolled diabetes"], "red_flags": []},
        "facilities": "Endocrinology Clinic, General Hospital",
        "response": {
            "referral_needed": True,
            "referral_type": "Endocrinology",
            "referral_urgency": "ROUTINE"
        }
    },
    {
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["New onset atrial fibrillation"], "red_flags": ["Irregular rhythm", "Tachycardia"]},
        "facilities": "Cardiology Clinic, Regional Hospital",
        "response": {
            "referral_needed": True,
            "referral_type": "Cardiology",
            "referral_urgency": "URGENT"
        }
    },
    {
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Well-controlled hypertension"], "red_flags": []},
        "facilities": "General Hospital",
        "response": {
            "referral_needed": False,
            "referral_type": "none",
            "referral_urgency": "ROUTINE"
        }
    },
    {
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Viral URI"], "red_flags": []},
        "facilities": "Community Health Center",
        "response": {
            "referral_needed": False,
            "referral_type": "none",
            "referral_urgency": "ROUTINE"
        }
    },
    {
        "assessment": {"triage_level": "URGENT", "differential_diagnoses": ["Suspected DVT"], "red_flags": ["Unilateral leg swelling", "Recent surgery"]},
        "facilities": "Vascular Surgery Clinic, Regional Hospital",
        "response": {
            "referral_needed": True,
            "referral_type": "Vascular Surgery",
            "referral_urgency": "URGENT"
        }
    },
    {
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Post-menopausal bleeding"], "red_flags": ["Post-menopausal bleeding"]},
        "facilities": "Gynecology Clinic, Women's Health Center",
        "response": {
            "referral_needed": True,
            "referral_type": "Gynecology",
            "referral_urgency": "URGENT"
        }
    },
    {
        "assessment": {"triage_level": "ROUTINE", "differential_diagnoses": ["Major depressive disorder"], "red_flags": []},
        "facilities": "Mental Health Clinic, Community Health Center",
        "response": {
            "referral_needed": True,
            "referral_type": "Psychiatry",
            "referral_urgency": "ROUTINE"
        }
    },
    {
        "assessment": {"triage_level": "EMERGENCY", "differential_diagnoses": ["Stroke"], "red_flags": ["Focal neurological deficit", "Sudden onset"]},
        "facilities": "Stroke Center, Regional Medical Center",
        "response": {
            "referral_needed": True,
            "referral_type": "Neurology / Stroke Team",
            "referral_urgency": "IMMEDIATE"
        }
    },
]


def generate_referral_advisor(scenario: Dict) -> Dict:
    """Generate a single referral advisor training example."""
    instruction = (
        f"ASSESSMENT: {json.dumps(scenario['assessment'])}, "
        f"FACILITIES: {scenario['facilities']}\n\n"
        'Return JSON only: {"referral_needed": true, "referral_type": "specialty", '
        '"referral_urgency": "IMMEDIATE|URGENT|ROUTINE"}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "referral_advisor",
    }


# =============================================================================
# Tool 6: Emergency Protocol
# =============================================================================

EMERGENCY_PROTOCOL_SCENARIOS = [
    {
        "symptoms": "crushing chest pain, diaphoresis, shortness of breath, nausea",
        "vitals": {"bp": "160/95", "hr": 110, "rr": 22, "spo2": 94},
        "response": {
            "emergency_level": "CRITICAL",
            "immediate_actions": [
                "Call emergency services (911) immediately",
                "Position patient sitting upright at 45 degrees",
                "If available and no allergy: give aspirin 325mg to chew",
                "Loosen tight clothing",
                "Do NOT let patient walk or exert themselves",
                "Monitor consciousness and prepare for CPR"
            ],
            "call_for_help": "Call 911 immediately - suspected myocardial infarction",
            "monitoring": "Monitor consciousness, breathing, and pulse every 2 minutes until EMS arrives"
        }
    },
    {
        "symptoms": "bee sting 10 minutes ago, facial swelling, wheezing, diffuse urticarial rash",
        "vitals": {"bp": "90/60", "hr": 130, "rr": 28, "spo2": 90},
        "response": {
            "emergency_level": "CRITICAL",
            "immediate_actions": [
                "Call 911 immediately",
                "If patient has epinephrine auto-injector: assist with use on outer thigh",
                "Position patient lying down with legs elevated unless breathing difficulty",
                "Remove stinger if visible by scraping (do not squeeze)",
                "Monitor airway closely",
                "If breathing stops: begin CPR"
            ],
            "call_for_help": "Call 911 immediately - anaphylaxis, airway compromise",
            "monitoring": "Monitor airway, breathing rate, and level of consciousness continuously"
        }
    },
    {
        "symptoms": "generalized tonic-clonic seizure in progress for 3 minutes, unresponsive",
        "vitals": {"hr": 120, "rr": 8},
        "response": {
            "emergency_level": "SEVERE",
            "immediate_actions": [
                "Note time seizure started",
                "Clear area of hazards",
                "Place patient on side (recovery position) if possible",
                "Do NOT restrain or put anything in mouth",
                "Protect head with soft padding",
                "Call 911 if seizure lasts more than 5 minutes"
            ],
            "call_for_help": "Call 911 if seizure exceeds 5 minutes or patient does not regain consciousness",
            "monitoring": "Time the seizure duration, monitor breathing and consciousness post-seizure"
        }
    },
    {
        "symptoms": "severe allergic reaction after eating peanuts, lip swelling, throat tightness, voice hoarseness",
        "vitals": {"bp": "100/65", "hr": 115, "rr": 24, "spo2": 92},
        "response": {
            "emergency_level": "CRITICAL",
            "immediate_actions": [
                "Call 911 immediately",
                "Administer epinephrine auto-injector if available",
                "Position patient sitting upright to ease breathing",
                "Remove any remaining food from mouth",
                "Prepare for possible CPR if airway closes",
                "Give second epinephrine dose after 5 minutes if no improvement"
            ],
            "call_for_help": "Call 911 immediately - anaphylaxis with airway compromise",
            "monitoring": "Monitor breathing, voice quality, and swelling progression every minute"
        }
    },
    {
        "symptoms": "child found unresponsive in pool, not breathing, no pulse",
        "vitals": {"hr": 0, "rr": 0},
        "response": {
            "emergency_level": "CRITICAL",
            "immediate_actions": [
                "Call 911 immediately or have someone call while you start CPR",
                "Remove child from water and place on flat surface",
                "Begin CPR: 30 chest compressions then 2 rescue breaths",
                "Continue CPR cycles without stopping",
                "If AED available: apply and follow voice prompts",
                "Do NOT attempt to drain water from lungs"
            ],
            "call_for_help": "Call 911 NOW - cardiac arrest, drowning",
            "monitoring": "Continue CPR until EMS arrives or child regains pulse and breathing"
        }
    },
    {
        "symptoms": "severe bleeding from deep laceration on forearm, blood pulsating",
        "vitals": {"bp": "95/60", "hr": 120, "rr": 22, "spo2": 96},
        "response": {
            "emergency_level": "SEVERE",
            "immediate_actions": [
                "Apply direct firm pressure with clean cloth to wound",
                "Elevate the injured arm above heart level",
                "If blood soaks through, add more cloth on top - do NOT remove first layer",
                "Call 911 for arterial bleeding (pulsating blood)",
                "If tourniquet available and bleeding uncontrollable: apply 2-3 inches above wound",
                "Keep patient warm and lying down"
            ],
            "call_for_help": "Call 911 - arterial bleeding from forearm laceration",
            "monitoring": "Monitor bleeding control, skin color, mental status, and pulse every 2 minutes"
        }
    },
]


def generate_emergency_protocol(scenario: Dict) -> Dict:
    """Generate a single emergency protocol training example."""
    instruction = (
        f"SYMPTOMS: {scenario['symptoms']}, "
        f"VITALS: {json.dumps(scenario['vitals'])}\n\n"
        'Return JSON only: {"emergency_level": "CRITICAL|SEVERE|MODERATE", '
        '"immediate_actions": ["action1", "action2"], '
        '"call_for_help": "who to call", "monitoring": "what to monitor"}\n\nJSON:'
    )
    return {
        "instruction": instruction,
        "response": json.dumps(scenario["response"], ensure_ascii=False),
        "category": "emergency_protocol",
    }


# =============================================================================
# Variation helpers — add slight randomness so the model doesn't memorize
# =============================================================================

def _vary_vitals(vitals: Dict[str, Any]) -> Dict[str, Any]:
    """Add small random variations to vital signs."""
    varied = {}
    for k, v in vitals.items():
        if isinstance(v, (int, float)):
            delta = max(1, int(v * 0.05))
            varied[k] = v + random.randint(-delta, delta)
        elif isinstance(v, str) and "/" in v:
            # BP format "120/80"
            parts = v.split("/")
            try:
                sys = int(parts[0]) + random.randint(-5, 5)
                dia = int(parts[1]) + random.randint(-3, 3)
                varied[k] = f"{sys}/{dia}"
            except ValueError:
                varied[k] = v
        else:
            varied[k] = v
    return varied


def _vary_scenario(scenario: Dict, keys_to_keep: List[str]) -> Dict:
    """Create a slightly varied copy of a scenario."""
    varied = dict(scenario)
    if "vitals" in varied:
        varied["vitals"] = _vary_vitals(varied["vitals"])
    return varied


# =============================================================================
# Main dataset generation
# =============================================================================

GENERATORS = [
    ("clinical_assessment", CLINICAL_ASSESSMENT_SCENARIOS, generate_clinical_assessment),
    ("soap_note", SOAP_NOTE_SCENARIOS, generate_soap_note),
    ("treatment_advisor", TREATMENT_SCENARIOS, generate_treatment_advisor),
    ("risk_assessor", RISK_SCENARIOS, generate_risk_assessor),
    ("referral_advisor", REFERRAL_SCENARIOS, generate_referral_advisor),
    ("emergency_protocol", EMERGENCY_PROTOCOL_SCENARIOS, generate_emergency_protocol),
]


def generate_dataset(target_per_tool: int = 200) -> List[Dict]:
    """Generate a balanced dataset with target_per_tool examples per tool."""
    dataset = []

    for tool_name, scenarios, gen_func in GENERATORS:
        count = 0
        while count < target_per_tool:
            for scenario in scenarios:
                if count >= target_per_tool:
                    break
                # Generate base example
                example = gen_func(scenario)
                dataset.append(example)
                count += 1

                # Generate varied example
                if count < target_per_tool:
                    varied = _vary_scenario(scenario, [])
                    example_v = gen_func(varied)
                    dataset.append(example_v)
                    count += 1

    random.shuffle(dataset)
    return dataset


def validate_dataset(dataset: List[Dict]) -> None:
    """Validate that all responses are parseable JSON with expected keys."""
    tool_keys = {
        "clinical_assessment": {"triage_level", "differential_diagnoses", "red_flags", "recommended_investigations"},
        "soap_note": {"subjective", "objective", "assessment", "plan"},
        "treatment_advisor": {"medications", "care_plan_goals"},
        "risk_assessor": {"risk_level", "risk_factors", "chronic_conditions", "recommendations"},
        "referral_advisor": {"referral_needed", "referral_type", "referral_urgency"},
        "emergency_protocol": {"emergency_level", "immediate_actions", "call_for_help", "monitoring"},
    }

    errors = []
    for i, example in enumerate(dataset):
        cat = example["category"]
        try:
            resp = json.loads(example["response"])
        except json.JSONDecodeError as e:
            errors.append(f"Line {i} ({cat}): Invalid JSON - {e}")
            continue

        expected_keys = tool_keys.get(cat, set())
        missing = expected_keys - set(resp.keys())
        if missing:
            errors.append(f"Line {i} ({cat}): Missing keys {missing}")

    if errors:
        print(f"❌ Validation found {len(errors)} errors:")
        for e in errors[:10]:
            print(f"   {e}")
    else:
        print(f"✅ All {len(dataset)} examples pass validation")


def main():
    parser = argparse.ArgumentParser(description="Generate tool-aligned training data for MedGemma")
    parser.add_argument("--train-count", type=int, default=200,
                        help="Target examples per tool for training set (default: 200)")
    parser.add_argument("--test-count", type=int, default=30,
                        help="Target examples per tool for test set (default: 30)")
    parser.add_argument("--output-dir", type=str, default=".",
                        help="Output directory for JSONL files")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate training set
    print(f"Generating training set ({args.train_count} per tool × {len(GENERATORS)} tools)...")
    train_data = generate_dataset(args.train_count)
    train_path = output_dir / "training_data_tool_aligned_train.jsonl"
    with open(train_path, "w") as f:
        for example in train_data:
            f.write(json.dumps(example, ensure_ascii=False) + "\n")
    print(f"  → {train_path}: {len(train_data)} examples")
    validate_dataset(train_data)

    # Generate test set
    print(f"\nGenerating test set ({args.test_count} per tool × {len(GENERATORS)} tools)...")
    test_data = generate_dataset(args.test_count)
    test_path = output_dir / "training_data_tool_aligned_test.jsonl"
    with open(test_path, "w") as f:
        for example in test_data:
            f.write(json.dumps(example, ensure_ascii=False) + "\n")
    print(f"  → {test_path}: {len(test_data)} examples")
    validate_dataset(test_data)

    # Summary
    from collections import Counter
    train_cats = Counter(e["category"] for e in train_data)
    print(f"\n📊 Training set distribution:")
    for cat, count in sorted(train_cats.items()):
        print(f"   {cat}: {count}")

    test_cats = Counter(e["category"] for e in test_data)
    print(f"\n📊 Test set distribution:")
    for cat, count in sorted(test_cats.items()):
        print(f"   {cat}: {count}")


if __name__ == "__main__":
    main()
