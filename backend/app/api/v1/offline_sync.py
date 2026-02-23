"""
Offline Sync API.
Handles data synchronization for offline-first CHW operation.

Sync flow:
  1. CHW works offline — creates/updates patients, encounters, observations locally
  2. On reconnection, POST /sync/upload to push local changes to the server
  3. GET /sync/download?since=<timestamp> to pull server changes made since last sync
  4. GET /sync/status to see last sync time and how many records are waiting
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from ...core.database import get_db
from ...models.patient import Patient
from ...models.encounter import Encounter
from ...models.observation import Observation
from ...models.device_sync import DeviceSync

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SyncRecord(BaseModel):
    type: str                       # "patient" | "encounter" | "observation"
    action: str                     # "create" | "update"
    payload: Dict[str, Any]         # full model dict from the device


class SyncRequest(BaseModel):
    device_id: str
    last_sync_timestamp: Optional[datetime] = None
    records: List[SyncRecord] = []


class SyncStatus(BaseModel):
    device_id: str
    last_sync_at: Optional[datetime]
    pending_downloads: int
    total_uploaded: int
    total_downloaded: int


class SyncResponse(BaseModel):
    status: str
    records_processed: int
    conflicts_detected: int
    sync_timestamp: str


class DownloadResponse(BaseModel):
    status: str
    patients: List[Dict[str, Any]]
    encounters: List[Dict[str, Any]]
    observations: List[Dict[str, Any]]
    total_records: int
    sync_timestamp: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(obj) -> Dict[str, Any]:
    """Convert a SQLAlchemy model instance to a plain dict."""
    d = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    # Convert datetime objects to ISO strings for JSON serialisation
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


async def _get_or_create_device(db: AsyncSession, device_id: str) -> DeviceSync:
    result = await db.execute(
        select(DeviceSync).where(DeviceSync.device_id == device_id)
    )
    device = result.scalar_one_or_none()
    if device is None:
        device = DeviceSync(
            id=str(uuid.uuid4()),
            device_id=device_id,
            last_sync_at=None,
            total_uploaded=0,
            total_downloaded=0,
        )
        db.add(device)
        await db.flush()   # assign defaults without committing
    return device


def _parse_incoming_ts(payload: Dict[str, Any], field: str) -> Optional[datetime]:
    """Parse an ISO datetime string from the incoming payload, return None if missing/invalid."""
    val = payload.get(field)
    if not val:
        return None
    try:
        if isinstance(val, datetime):
            return val
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        return dt
    except (ValueError, TypeError):
        return None


# Fields we never write from incoming data — SQLAlchemy/DB manages these
_READONLY_FIELDS = {"created_at", "updated_at"}


# ---------------------------------------------------------------------------
# POST /upload — push offline changes to the server
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=SyncResponse)
async def upload_offline_data(
    sync_request: SyncRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Upload records created or modified while offline.

    Each record in `records` must have:
      - type:    "patient" | "encounter" | "observation"
      - action:  "create" | "update"
      - payload: the full model dict (id is required)

    Conflict resolution: last-write-wins based on updated_at timestamp.
    If the server copy is newer, the incoming record is skipped (counted as conflict).
    """
    processed = 0
    conflicts = 0

    device = await _get_or_create_device(db, sync_request.device_id)

    for record in sync_request.records:
        rtype = record.type.lower()
        action = record.action.lower()
        payload = record.payload

        record_id = payload.get("id")
        if not record_id:
            continue  # skip malformed records without an id

        try:
            if rtype == "patient":
                result = await db.execute(select(Patient).where(Patient.id == record_id))
                existing = result.scalar_one_or_none()

                safe = {k: v for k, v in payload.items() if k not in _READONLY_FIELDS}

                if existing is None:
                    # Create new patient
                    db.add(Patient(**safe))
                    processed += 1
                else:
                    # Update: last-write-wins
                    incoming_ts = _parse_incoming_ts(payload, "updated_at")
                    server_ts = existing.updated_at or existing.created_at
                    if incoming_ts and server_ts:
                        # Normalise both to naive UTC for comparison
                        inc = incoming_ts.replace(tzinfo=None) if incoming_ts.tzinfo else incoming_ts
                        srv = server_ts.replace(tzinfo=None) if server_ts.tzinfo else server_ts
                        if srv > inc:
                            conflicts += 1
                            continue
                    for k, v in safe.items():
                        if k != "id":
                            setattr(existing, k, v)
                    processed += 1

            elif rtype == "encounter":
                result = await db.execute(select(Encounter).where(Encounter.id == record_id))
                existing = result.scalar_one_or_none()

                safe = {k: v for k, v in payload.items() if k not in _READONLY_FIELDS}

                if existing is None:
                    db.add(Encounter(**safe))
                    processed += 1
                else:
                    incoming_ts = _parse_incoming_ts(payload, "updated_at")
                    server_ts = existing.updated_at or existing.created_at
                    if incoming_ts and server_ts:
                        inc = incoming_ts.replace(tzinfo=None) if incoming_ts.tzinfo else incoming_ts
                        srv = server_ts.replace(tzinfo=None) if server_ts.tzinfo else server_ts
                        if srv > inc:
                            conflicts += 1
                            continue
                    for k, v in safe.items():
                        if k != "id":
                            setattr(existing, k, v)
                    processed += 1

            elif rtype == "observation":
                result = await db.execute(select(Observation).where(Observation.id == record_id))
                existing = result.scalar_one_or_none()

                safe = {k: v for k, v in payload.items() if k not in _READONLY_FIELDS}
                # Observation has no updated_at — only insert, no conflict check needed
                if existing is None:
                    db.add(Observation(**safe))
                    processed += 1
                # If it already exists we leave it (observations are immutable measurements)

        except Exception:
            # Skip bad records; don't fail the whole upload
            continue

    device.total_uploaded += processed
    device.last_sync_at = datetime.now(timezone.utc)

    await db.commit()

    return SyncResponse(
        status="success",
        records_processed=processed,
        conflicts_detected=conflicts,
        sync_timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# GET /download — pull server changes since a given timestamp
# ---------------------------------------------------------------------------

@router.get("/download", response_model=DownloadResponse)
async def download_server_updates(
    device_id: str = Query(..., description="Unique device identifier"),
    since: datetime = Query(..., description="ISO datetime — fetch records modified after this time"),
    db: AsyncSession = Depends(get_db),
):
    """
    Download all records modified on the server since `since`.

    Returns patients, encounters, and observations updated after the timestamp.
    Use the returned `sync_timestamp` as your next `since` value.
    """
    # Normalise `since` to naive UTC
    since_naive = since.replace(tzinfo=None) if since.tzinfo else since

    # Patients — filter by coalesce(updated_at, created_at) >= since
    patient_filter = or_(
        Patient.updated_at >= since_naive,
        and_(Patient.updated_at == None, Patient.created_at >= since_naive),  # noqa: E711
    )
    p_result = await db.execute(
        select(Patient).where(patient_filter).order_by(Patient.created_at)
    )
    patients = [_row_to_dict(p) for p in p_result.scalars().all()]

    # Encounters — same coalesce pattern
    enc_filter = or_(
        Encounter.updated_at >= since_naive,
        and_(Encounter.updated_at == None, Encounter.created_at >= since_naive),  # noqa: E711
    )
    e_result = await db.execute(
        select(Encounter).where(enc_filter).order_by(Encounter.created_at)
    )
    encounters = [_row_to_dict(e) for e in e_result.scalars().all()]

    # Observations — no updated_at, use created_at only
    o_result = await db.execute(
        select(Observation)
        .where(Observation.created_at >= since_naive)
        .order_by(Observation.created_at)
    )
    observations = [_row_to_dict(o) for o in o_result.scalars().all()]

    total = len(patients) + len(encounters) + len(observations)
    now = datetime.now(timezone.utc)

    # Update DeviceSync record
    device = await _get_or_create_device(db, device_id)
    device.last_sync_at = now
    device.total_downloaded += total
    await db.commit()

    return DownloadResponse(
        status="success",
        patients=patients,
        encounters=encounters,
        observations=observations,
        total_records=total,
        sync_timestamp=now.isoformat(),
    )


# ---------------------------------------------------------------------------
# GET /status — sync state for a device
# ---------------------------------------------------------------------------

@router.get("/status", response_model=SyncStatus)
async def get_sync_status(
    device_id: str = Query(..., description="Unique device identifier"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return current sync state for a device:
    - When it last synced
    - How many records have been updated on the server since then (pending downloads)
    """
    device = await _get_or_create_device(db, device_id)
    await db.commit()   # persist new device if just created

    pending = 0
    if device.last_sync_at:
        last = device.last_sync_at.replace(tzinfo=None) if device.last_sync_at.tzinfo else device.last_sync_at

        p_filter = or_(
            Patient.updated_at > last,
            and_(Patient.updated_at == None, Patient.created_at > last),  # noqa: E711
        )
        p_count = await db.execute(select(func.count()).select_from(Patient).where(p_filter))

        e_filter = or_(
            Encounter.updated_at > last,
            and_(Encounter.updated_at == None, Encounter.created_at > last),  # noqa: E711
        )
        e_count = await db.execute(select(func.count()).select_from(Encounter).where(e_filter))

        o_count = await db.execute(
            select(func.count()).select_from(Observation).where(Observation.created_at > last)
        )

        pending = (p_count.scalar() or 0) + (e_count.scalar() or 0) + (o_count.scalar() or 0)

    return SyncStatus(
        device_id=device_id,
        last_sync_at=device.last_sync_at,
        pending_downloads=pending,
        total_uploaded=device.total_uploaded,
        total_downloaded=device.total_downloaded,
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@router.get("/health")
async def check_sync_health():
    """Check if the sync service is operational."""
    return {
        "status": "operational",
        "offline_mode_enabled": True,
        "syncs_entities": ["patients", "encounters", "observations"],
        "conflict_resolution": "last-write-wins (updated_at timestamp)",
    }
