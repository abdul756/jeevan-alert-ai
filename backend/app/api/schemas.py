"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime, date


# ============= Patient Schemas =============

class AddressSchema(BaseModel):
    """Address information."""
    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zipCode: Optional[str] = Field(None, alias="zipCode")
    country: Optional[str] = None
    
    class Config:
        populate_by_name = True


class PatientCreate(BaseModel):
    """Schema for creating a patient."""
    name: str = Field(..., min_length=1, max_length=200)
    date_of_birth: Optional[date] = None
    age: Optional[int] = Field(None, ge=0, le=150)
    gender: str = Field(..., pattern="^(Male|Female|Other)$")
    
    mobile_country_code: str = Field(default="+1")
    mobile: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None
    
    address: Optional[AddressSchema] = None
    
    height_cm: Optional[float] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    
    medical_history: Optional[str] = None
    allergies: Optional[str] = None


class PatientUpdate(BaseModel):
    """Schema for updating a patient."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    age: Optional[int] = Field(None, ge=0, le=150)
    gender: Optional[str] = Field(None, pattern="^(Male|Female|Other)$")
    
    mobile_country_code: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    
    address: Optional[AddressSchema] = None
    
    height_cm: Optional[float] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    active: Optional[bool] = None


class PatientResponse(BaseModel):
    """Schema for patient response."""
    id: str
    name: str
    age: Optional[int]
    gender: str
    mobile_country_code: str
    mobile: str
    email: Optional[str]
    address: Optional[dict]
    height_cm: Optional[float]
    weight_kg: Optional[float]
    medical_history: Optional[str]
    allergies: Optional[str]
    active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class PatientSummary(BaseModel):
    """Summary view of patient (for lists)."""
    id: str
    name: str
    age: Optional[int]
    gender: str
    mobile: str
    active: bool
    
    class Config:
        from_attributes = True


# ============= Encounter Schemas =============

class EncounterCreate(BaseModel):
    """Schema for creating an encounter."""
    patient_id: str
    encounter_type: str = Field(default="home-visit")
    chief_complaint: Optional[str] = None
    symptoms: Optional[str] = None
    symptom_duration: Optional[str] = None 
    scheduled_at: Optional[datetime] = None


class EncounterUpdate(BaseModel):
    """Schema for updating an encounter."""
    status: Optional[str] = None
    chief_complaint: Optional[str] = None
    symptoms: Optional[str] = None
    symptom_duration: Optional[str] = None
    triage_level: Optional[str] = None
    assessment_summary: Optional[str] = None
    soap_note: Optional[dict] = None


class EncounterResponse(BaseModel):
    """Schema for encounter response."""
    id: str
    patient_id: str
    encounter_type: str
    status: str
    chief_complaint: Optional[str]
    symptoms: Optional[str]
    symptom_duration: Optional[str]
    triage_level: Optional[str]
    assessment_summary: Optional[str]
    soap_note: Optional[dict]
    ai_assessment_data: Optional[dict] = None
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    @field_validator('soap_note', mode='before')
    @classmethod
    def parse_soap_note(cls, v):
        """Parse soap_note from JSON string to dict if needed."""
        if v is None:
            return None
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v

    class Config:
        from_attributes = True


# ============= Observation Schemas =============

class ObservationCreate(BaseModel):
    """Schema for creating an observation."""
    patient_id: str
    encounter_id: Optional[str] = None
    observation_type: str
    value: float
    unit: str
    value_secondary: Optional[float] = None  # For BP diastolic
    
    @field_validator('observation_type')
    @classmethod
    def validate_observation_type(cls, v):
        valid_types = [
            "blood-pressure", "heart-rate", "temperature", 
            "respiratory-rate", "spo2", "blood-glucose",
            "weight", "height", "bmi", "pain-scale"
        ]
        if v not in valid_types:
            raise ValueError(f"Invalid observation type. Must be one of: {valid_types}")
        return v


class ObservationResponse(BaseModel):
    """Schema for observation response."""
    id: str
    patient_id: str
    encounter_id: Optional[str]
    observation_type: str
    value: float
    unit: str
    value_secondary: Optional[float]
    is_abnormal: Optional[str]
    observed_at: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True
