"""
Analytics & Reporting API.
Provides dashboard data and analytics.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Dict, Any
from datetime import datetime, timedelta

from ...core.database import get_db
from ...models.patient import Patient
from ...models.encounter import Encounter, EncounterStatus
from ...models.observation import Observation

router = APIRouter()


@router.get("/dashboard", response_model=Dict[str, Any])
async def get_dashboard_summary(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """
    Get comprehensive dashboard summary for CHW.
    Shows key metrics for the specified time period.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    # Total patients
    result = await db.execute(select(func.count(Patient.id)))
    total_patients = result.scalar()

    # Active encounters
    result = await db.execute(
        select(func.count(Encounter.id))
        .where(Encounter.status == EncounterStatus.IN_PROGRESS)
    )
    active_encounters = result.scalar()

    # Recent encounters
    result = await db.execute(
        select(func.count(Encounter.id))
        .where(Encounter.created_at >= cutoff_date)
    )
    recent_encounters = result.scalar()

    # Emergency cases (emergent or urgent triage)
    result = await db.execute(
        select(func.count(Encounter.id))
        .where(
            and_(
                Encounter.triage_level.isnot(None),
                func.lower(Encounter.triage_level).in_(['emergent', 'emergency', 'urgent'])
            )
        )
    )
    emergency_cases = result.scalar()

    # Pending referrals (IN_PROGRESS encounters with referral_needed in AI assessment data)
    # Only count referrals from encounters actively in progress (truly actionable)
    result = await db.execute(
        select(Encounter).where(
            and_(
                Encounter.created_at >= cutoff_date,  # Recent encounters only
                Encounter.status == EncounterStatus.IN_PROGRESS,  # Actively being worked on
                Encounter.ai_assessment_data.isnot(None),  # Has AI assessment
            )
        )
    )
    in_progress_encounters_with_ai = result.scalars().all()
    pending_referrals = sum(
        1 for enc in in_progress_encounters_with_ai
        if enc.ai_assessment_data.get("referral_needed", False)
    )

    return {
        "period_days": days,
        "summary": {
            "total_patients": total_patients,
            "active_encounters": active_encounters,
            "recent_encounters": recent_encounters,
            "emergency_cases": emergency_cases,
            "pending_referrals": pending_referrals,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.get("/encounters/trends", response_model=Dict[str, Any])
async def get_encounter_trends(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Get encounter trends and triage distribution."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(Encounter).where(Encounter.created_at >= cutoff_date)
    )
    encounters = result.scalars().all()

    # Triage level distribution
    triage_counts = {"emergent": 0, "urgent": 0, "routine": 0, "not_assessed": 0}
    for enc in encounters:
        # Normalize triage level to lowercase and handle None/empty values
        level = (enc.triage_level or "not_assessed").lower().strip()
        # Map to known categories, default to not_assessed if unknown
        if level not in triage_counts:
            level = "not_assessed"
        triage_counts[level] += 1

    # Status distribution
    status_counts: Dict[str, int] = {}
    for enc in encounters:
        status = enc.status.value
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "period_days": days,
        "total_encounters": len(encounters),
        "triage_distribution": triage_counts,
        "status_distribution": status_counts,
        "average_per_day": round(len(encounters) / days, 2) if days > 0 else 0,
    }


@router.get("/vitals/abnormal", response_model=Dict[str, Any])
async def get_abnormal_vitals_summary(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
):
    """Get summary of abnormal vital signs."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(Observation).where(
            and_(
                Observation.observed_at >= cutoff_date,
                Observation.is_abnormal == True,
            )
        )
    )
    abnormal_obs = result.scalars().all()

    # Count by type
    by_type: Dict[str, int] = {}
    for obs in abnormal_obs:
        obs_type = obs.observation_type.value
        by_type[obs_type] = by_type.get(obs_type, 0) + 1

    unique_patients = len({obs.patient_id for obs in abnormal_obs})

    return {
        "period_days": days,
        "total_abnormal": len(abnormal_obs),
        "patients_affected": unique_patients,
        "by_type": by_type,
        "requires_followup": unique_patients,
    }


@router.get("/ai-usage", response_model=Dict[str, Any])
async def get_ai_usage_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Get AI agent usage statistics."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(func.count(Encounter.id)).where(
            and_(
                Encounter.created_at >= cutoff_date,
                Encounter.assessment_summary.isnot(None),
            )
        )
    )
    ai_assessments = result.scalar()

    result = await db.execute(
        select(func.count(Encounter.id)).where(Encounter.created_at >= cutoff_date)
    )
    total_encounters = result.scalar()

    return {
        "period_days": days,
        "total_encounters": total_encounters,
        "ai_assisted_encounters": ai_assessments,
        "ai_usage_rate": round(ai_assessments / total_encounters * 100, 1) if total_encounters > 0 else 0,
        "agent_system": "LangGraph Tool-Based Workflow",
        "active_tools": 7,
        "tool_list": ["Clinical Assessment", "SOAP Note", "Treatment Advisor", "Risk Assessor", "Referral Advisor", "Emergency Protocol", "Skin Cancer Detection"],
    }
