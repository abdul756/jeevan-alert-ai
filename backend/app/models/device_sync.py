"""
DeviceSync model — tracks per-device sync state for offline-first operation.
"""
import uuid
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..core.database import Base


class DeviceSync(Base):
    __tablename__ = "device_syncs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    device_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    last_sync_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    total_uploaded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_downloaded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
