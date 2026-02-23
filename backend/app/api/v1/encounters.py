"""
Encounter API endpoints.
Handles clinical visits and assessments.
"""
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
from pathlib import Path
import aiofiles
import uuid

from ...core.database import get_db
from ...models.encounter import Encounter
from ...models.patient import Patient
from ..schemas import EncounterCreate, EncounterUpdate, EncounterResponse
from ...core.config import settings

router = APIRouter()


@router.post("", response_model=EncounterResponse, status_code=status.HTTP_201_CREATED)
async def create_encounter(
    encounter_data: EncounterCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new clinical encounter."""
    # Verify patient exists
    result = await db.execute(
        select(Patient).where(Patient.id == encounter_data.patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {encounter_data.patient_id} not found"
        )
    
    # Create encounter
    encounter_dict = encounter_data.model_dump()
    encounter = Encounter(**encounter_dict)
    
    db.add(encounter)
    await db.commit()
    await db.refresh(encounter)
    
    return encounter


@router.get("/{encounter_id}", response_model=EncounterResponse)
async def get_encounter(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get encounter by ID."""
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()
    
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )
    
    return encounter


@router.put("/{encounter_id}", response_model=EncounterResponse)
async def update_encounter(
    encounter_id: str,
    encounter_data: EncounterUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update encounter information."""
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()
    
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )
    
    # Update fields
    update_data = encounter_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(encounter, field, value)
    
    await db.commit()
    await db.refresh(encounter)
    
    return encounter


@router.get("/patient/{patient_id}", response_model=List[EncounterResponse])
async def list_patient_encounters(
    patient_id: str,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all encounters for a patient."""
    query = select(Encounter).where(Encounter.patient_id == patient_id)
    query = query.offset(skip).limit(limit).order_by(Encounter.created_at.desc())
    
    result = await db.execute(query)
    encounters = result.scalars().all()
    
    return encounters


@router.post("/{encounter_id}/start", response_model=EncounterResponse)
async def start_encounter(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Mark encounter as started."""
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()
    
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )
    
    encounter.status = "in-progress"
    encounter.started_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(encounter)
    
    return encounter


@router.post("/{encounter_id}/complete", response_model=EncounterResponse)
async def complete_encounter(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Mark encounter as completed."""
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()
    
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )
    
    encounter.status = "completed"
    encounter.completed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(encounter)
    
    return encounter


@router.post("/{encounter_id}/assessment", response_model=EncounterResponse)
async def run_symptom_assessment(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Run AI-powered symptom assessment on encounter.
    This will integrate with the Symptom Assessment Agent.
    """
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()

    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )

    # TODO: Integrate with Symptom Assessment Agent
    # For now, return a placeholder response
    encounter.assessment_summary = "AI assessment will be implemented in next phase"
    encounter.triage_level = "routine"

    await db.commit()
    await db.refresh(encounter)

    return encounter


@router.post("/{encounter_id}/upload-image")
async def upload_encounter_image(
    encounter_id: str,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload an image for an encounter (e.g., skin lesion photo).
    Saves the image to disk and returns the file path.
    """
    # Verify encounter exists
    result = await db.execute(
        select(Encounter).where(Encounter.id == encounter_id)
    )
    encounter = result.scalar_one_or_none()

    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter with ID {encounter_id} not found"
        )

    # Validate image file type
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG)"
        )

    # Validate file size
    contents = await image.read()
    max_size = settings.max_image_size_mb * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds {settings.max_image_size_mb}MB limit"
        )

    # Reset file pointer
    await image.seek(0)

    # Create uploads directory structure: uploads/encounters/{encounter_id}/
    uploads_dir = Path(__file__).parent.parent.parent.parent / "uploads" / "encounters" / encounter_id
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_ext = Path(image.filename).suffix if image.filename else ".jpg"
    filename = f"{encounter_id}_{timestamp}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = uploads_dir / filename

    # Save file asynchronously
    async with aiofiles.open(file_path, 'wb') as out_file:
        await out_file.write(contents)

    # Return absolute path for backend use (for Ollama to read the file)
    absolute_path = str(file_path.absolute())

    # Generate relative path for API responses (without leading slash)
    relative_path = f"uploads/encounters/{encounter_id}/{filename}"

    # Build full URL
    base_url = f"http://localhost:8000"  # TODO: Get from settings
    image_url = f"{base_url}/{relative_path}"

    # Save image path to encounter (for later workflow use)
    encounter.image_path = absolute_path
    encounter.image_type = "skin"  # Default to skin, can make this a request param later
    await db.commit()

    return {
        "success": True,
        "image_path": absolute_path,  # Full path for backend to read file
        "relative_path": relative_path,  # Relative path for API
        "image_url": image_url,
        "filename": filename,
        "size_bytes": len(contents),
        "content_type": image.content_type
    }
