"""
CHW Staff User model.
"""
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func
from ..core.database import Base
import uuid
import hashlib


class CHWStaff(Base):
    """Community Health Worker staff member."""
    
    __tablename__ = "chw_staff"
    
    # Primary Key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Authentication
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    
    # Profile Information
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<CHWStaff(id={self.id}, email={self.email}, name={self.full_name})>"
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using SHA-256."""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def verify_password(self, password: str) -> bool:
        """Verify password against stored hash."""
        return self.password_hash == self.hash_password(password)
