"""
Observation model for vital signs and clinical measurements.
"""
from sqlalchemy import Column, String, ForeignKey, Float, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base
import uuid
import enum


class ObservationType(str, enum.Enum):
    """Type of clinical observation."""
    BLOOD_PRESSURE = "blood-pressure"
    HEART_RATE = "heart-rate"
    TEMPERATURE = "temperature"
    RESPIRATORY_RATE = "respiratory-rate"
    SPO2 = "spo2"
    BLOOD_GLUCOSE = "blood-glucose"
    WEIGHT = "weight"
    HEIGHT = "height"
    BMI = "bmi"
    PAIN_SCALE = "pain-scale"


class Observation(Base):
    """Clinical observation (vital signs, measurements)."""
    
    __tablename__ = "observations"
    
    # Primary Key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign Keys
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    encounter_id = Column(String, ForeignKey("encounters.id"), nullable=True, index=True)
    
    # Observation Data
    observation_type = Column(Enum(ObservationType), nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)  # mmHg, bpm, °F, %, mg/dL, kg, cm
    
    # For blood pressure (systolic/diastolic)
    value_secondary = Column(Float, nullable=True)  # Diastolic for BP
    
    # Flags
    is_abnormal = Column(String, nullable=True)  # "high", "low", "critical"
    
    # Timestamps
    observed_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    patient = relationship("Patient", back_populates="observations")
    encounter = relationship("Encounter", back_populates="observations")
    
    def __repr__(self):
        return f"<Observation(id={self.id}, type={self.observation_type}, value={self.value}{self.unit})>"
