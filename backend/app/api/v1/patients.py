"""
Patient API endpoints.
Handles patient demographics and registration.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ...core.database import get_db
from ...models.patient import Patient
from ..schemas import PatientCreate, PatientUpdate, PatientResponse, PatientSummary

router = APIRouter()


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    patient_data: PatientCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new patient."""
    # Convert Pydantic model to dict
    patient_dict = patient_data.model_dump(exclude_unset=True)
    
    # Handle address separately (convert to dict if present)
    if 'address' in patient_dict and patient_dict['address']:
        patient_dict['address'] = patient_dict['address'].model_dump() if hasattr(patient_dict['address'], 'model_dump') else patient_dict['address']
    
    # Create patient
    patient = Patient(**patient_dict)
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get patient by ID."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found"
        )
    
    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update patient information."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found"
        )
    
    # Update fields
    update_data = patient_data.model_dump(exclude_unset=True)
    
    # Handle address conversion
    if 'address' in update_data and update_data['address']:
        update_data['address'] = update_data['address'].model_dump() if hasattr(update_data['address'], 'model_dump') else update_data['address']
    
    for field, value in update_data.items():
        setattr(patient, field, value)
    
    await db.commit()
    await db.refresh(patient)
    
    return patient


@router.get("", response_model=List[PatientSummary])
async def list_patients(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """List all patients."""
    query = select(Patient)
    
    if active_only:
        query = query.where(Patient.active == True)
    
    query = query.offset(skip).limit(limit).order_by(Patient.created_at.desc())
    
    result = await db.execute(query)
    patients = result.scalars().all()
    
    return patients


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Soft delete a patient (set active=False)."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found"
        )
    
    patient.active = False
    await db.commit()
    
    return None


@router.get("/{patient_id}/summary", response_model=dict)
async def get_patient_summary(
    patient_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive patient summary with related data."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found"
        )
    
    # TODO: Add counts for related entities (encounters, conditions, etc.)
    # This will be enhanced when we have more endpoints
    
    return {
        "patient": PatientResponse.model_validate(patient),
        "stats": {
            "total_encounters": 0,  # Will be populated from relationships
            "active_conditions": 0,
            "current_medications": 0,
        }
    }
