"""
Encounter model for clinical visits and assessments.
"""
from sqlalchemy import Column, String, ForeignKey, DateTime, JSON, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base
import uuid
import enum


class EncounterStatus(str, enum.Enum):
    """Encounter status enumeration."""
    PLANNED = "planned"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EncounterType(str, enum.Enum):
    """Encounter type enumeration."""
    HOME_VISIT = "home-visit"
    PHONE_CALL = "phone-call"
    CLINIC = "clinic"
    EMERGENCY = "emergency"
    ASSESSMENT = "assessment"


class Encounter(Base):
    """Clinical encounter/visit record."""
    
    __tablename__ = "encounters"
    
    # Primary Key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign Key
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    
    # Encounter Details
    encounter_type = Column(
        Enum(EncounterType, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=EncounterType.HOME_VISIT
    )
    status = Column(
        Enum(EncounterStatus, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=EncounterStatus.PLANNED
    )
    
    # Clinical Information
    chief_complaint = Column(String, nullable=True)
    symptoms = Column(Text, nullable=True)
    symptom_duration = Column(String, nullable=True)
    
    # Assessment (AI-generated)
    triage_level = Column(String, nullable=True)  # emergent, urgent, routine
    assessment_summary = Column(Text, nullable=True)
    soap_note = Column(JSON, nullable=True)  # {subjective, objective, assessment, plan}
    ai_assessment_data = Column(JSON, nullable=True)  # Full AI assessment results for persistence

    # Multimodal data
    image_path = Column(String, nullable=True)  # Absolute path to uploaded image
    image_type = Column(String, nullable=True)  # "skin", "xray", "general"

    # Agent Interactions (stored for observability)
    agent_conversations = Column(JSON, nullable=True)  # Array of agent interactions
    
    # Timestamps
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    patient = relationship("Patient", back_populates="encounters")
    observations = relationship("Observation", back_populates="encounter", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Encounter(id={self.id}, patient_id={self.patient_id}, type={self.encounter_type})>"
