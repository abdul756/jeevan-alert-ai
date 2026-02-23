"""
Observation API endpoints.
Handles vital signs and clinical measurements.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime, timedelta

from ...core.database import get_db
from ...models.observation import Observation, ObservationType
from ...models.patient import Patient
from ..schemas import ObservationCreate, ObservationResponse

router = APIRouter()


def check_abnormal_vitals(obs_type: str, value: float, value_secondary: float = None) -> str | None:
    """
    Check if vital sign is abnormal.
    Returns 'high', 'low', 'critical', or None
    """
    # Simple threshold checking - can be made more sophisticated
    thresholds = {
        "blood-pressure": {"systolic_high": 140, "systolic_low": 90, "diastolic_high": 90, "diastolic_low": 60},
        "heart-rate": {"high": 100, "low": 60, "critical_high": 120, "critical_low": 40},
        "temperature": {"high": 100.4, "low": 96.8, "critical_high": 103, "critical_low": 95},
        "spo2": {"low": 95, "critical_low": 90},
        "blood-glucose": {"high": 180, "low": 70, "critical_high": 250, "critical_low": 54},
    }
    
    if obs_type not in thresholds:
        return None
    
    t = thresholds[obs_type]
    
    # Blood pressure special case
    if obs_type == "blood-pressure" and value_secondary:
        if value >= t["systolic_high"] or value_secondary >= t["diastolic_high"]:
            return "high"
        if value <= t["systolic_low"] or value_secondary <= t["diastolic_low"]:
            return "low"
        return None
    
    # Check for critical values
    if "critical_high" in t and value >= t["critical_high"]:
        return "critical"
    if "critical_low" in t and value <= t["critical_low"]:
        return "critical"
    
    # Check for high/low
    if "high" in t and value >= t["high"]:
        return "high"
    if "low" in t and value <= t["low"]:
        return "low"
    
    return None


@router.post("", response_model=ObservationResponse, status_code=status.HTTP_201_CREATED)
async def create_observation(
    obs_data: ObservationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Record a new vital sign or measurement."""
    # Verify patient exists
    result = await db.execute(
        select(Patient).where(Patient.id == obs_data.patient_id)
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {obs_data.patient_id} not found"
        )
    
    # Create observation
    obs_dict = obs_data.model_dump()
    observation = Observation(**obs_dict)
    
    # Check if abnormal
    abnormal_flag = check_abnormal_vitals(
        obs_data.observation_type, 
        obs_data.value, 
        obs_data.value_secondary
    )
    observation.is_abnormal = abnormal_flag
    
    db.add(observation)
    await db.commit()
    await db.refresh(observation)
    
    return observation


@router.get("/abnormal", response_model=List[ObservationResponse])
async def list_abnormal_observations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all abnormal observations across all patients."""
    query = select(Observation).where(Observation.is_abnormal.isnot(None))
    query = query.offset(skip).limit(limit).order_by(Observation.observed_at.desc())

    result = await db.execute(query)
    observations = result.scalars().all()

    return observations


@router.get("/{observation_id}", response_model=ObservationResponse)
async def get_observation(
    observation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get observation by ID."""
    result = await db.execute(
        select(Observation).where(Observation.id == observation_id)
    )
    observation = result.scalar_one_or_none()

    if not observation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observation with ID {observation_id} not found"
        )

    return observation


@router.get("/patient/{patient_id}", response_model=List[ObservationResponse])
async def list_patient_observations(
    patient_id: str,
    observation_type: str = None,
    days: int = 30,
    db: AsyncSession = Depends(get_db)
):
    """List observations for a patient, optionally filtered by type and time range."""
    query = select(Observation).where(Observation.patient_id == patient_id)
    
    if observation_type:
        query = query.where(Observation.observation_type == observation_type)
    
    # Filter by date range
    since_date = datetime.utcnow() - timedelta(days=days)
    query = query.where(Observation.observed_at >= since_date)
    
    query = query.order_by(Observation.observed_at.desc())
    
    result = await db.execute(query)
    observations = result.scalars().all()
    
    return observations


@router.get("/encounter/{encounter_id}", response_model=List[ObservationResponse])
async def list_encounter_observations(
    encounter_id: str,
    db: AsyncSession = Depends(get_db)
):
    """List observations for a specific encounter."""
    query = select(Observation).where(Observation.encounter_id == encounter_id)
    query = query.order_by(Observation.observed_at.desc())
    
    result = await db.execute(query)
    observations = result.scalars().all()
    
    return observations


@router.get("/patient/{patient_id}/trends", response_model=dict)
async def get_observation_trends(
    patient_id: str,
    observation_type: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db)
):
    """Get trend analysis for a specific observation type."""
    query = select(Observation).where(
        Observation.patient_id == patient_id,
        Observation.observation_type == observation_type
    )
    
    since_date = datetime.utcnow() - timedelta(days=days)
    query = query.where(Observation.observed_at >= since_date)
    query = query.order_by(Observation.observed_at.asc())
    
    result = await db.execute(query)
    observations = result.scalars().all()
    
    if not observations:
        return {
            "observation_type": observation_type,
            "count": 0,
            "data_points": [],
            "trend": None,
            "alerts": []
        }
    
    # Simple trend analysis
    values = [obs.value for obs in observations]
    avg_value = sum(values) / len(values)
    
    # Check for recent abnormals
    alerts = []
    for obs in observations[-5:]:  # Last 5 observations
        if obs.is_abnormal:
            alerts.append({
                "date": obs.observed_at.isoformat(),
                "value": obs.value,
                "flag": obs.is_abnormal
            })
    
    return {
        "observation_type": observation_type,
        "count": len(observations),
        "average": round(avg_value, 2),
        "latest": values[-1] if values else None,
        "data_points": [
            {"date": obs.observed_at.isoformat(), "value": obs.value}
            for obs in observations
        ],
        "alerts": alerts
    }
