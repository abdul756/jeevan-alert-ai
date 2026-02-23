"""
Patient model for demographic and contact information.
"""
from sqlalchemy import Column, String, Integer, Date, JSON, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base
import uuid


class Patient(Base):
    """Patient demographic and registration data."""
    
    __tablename__ = "patients"
    
    # Primary Key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Demographics
    name = Column(String, nullable=False, index=True)
    date_of_birth = Column(Date, nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=False)  # Male, Female, Other
    
    # Contact Information
    mobile_country_code = Column(String, default="+1")
    mobile = Column(String, nullable=False)
    email = Column(String, nullable=True)
    
    # Address (stored as JSON for flexibility)
    address = Column(JSON, nullable=True)  # {line1, line2, city, state, zipCode, country}
    
    # Physical Measurements
    height_cm = Column(Integer, nullable=True)
    weight_kg = Column(Integer, nullable=True)
    
    # Medical Background (text fields)
    medical_history = Column(String, nullable=True)
    allergies = Column(String, nullable=True)
    
    # Metadata
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    encounters = relationship("Encounter", back_populates="patient", cascade="all, delete-orphan")
    observations = relationship("Observation", back_populates="patient", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Patient(id={self.id}, name={self.name})>"
