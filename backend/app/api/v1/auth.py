"""
Authentication API for CHW staff.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

from ...core.database import get_db
from ...models.chw_staff import CHWStaff

router = APIRouter()


# Schemas
class CHWRegistration(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    organization: Optional[str] = None


class CHWLogin(BaseModel):
    email: EmailStr
    password: str


class CHWResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str]
    organization: Optional[str]
    registered_at: datetime
    
    class Config:
        from_attributes = True


@router.post("/register", response_model=CHWResponse, status_code=status.HTTP_201_CREATED)
async def register_chw(
    registration: CHWRegistration,
    db: AsyncSession = Depends(get_db)
):
    """Register a new CHW staff member."""
    
    # Check if email already exists
    result = await db.execute(
        select(CHWStaff).where(CHWStaff.email == registration.email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate password length
    if len(registration.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )
    
    # Create new CHW staff member
    new_staff = CHWStaff(
        full_name=registration.full_name,
        email=registration.email,
        password_hash=CHWStaff.hash_password(registration.password),
        phone=registration.phone,
        organization=registration.organization
    )
    
    db.add(new_staff)
    await db.commit()
    await db.refresh(new_staff)
    
    return new_staff


@router.post("/login", response_model=dict)
async def login_chw(
    login: CHWLogin,
    db: AsyncSession = Depends(get_db)
):
    """Login CHW staff member."""
    
    # Find user by email
    result = await db.execute(
        select(CHWStaff).where(CHWStaff.email == login.email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not user.verify_password(login.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "organization": user.organization
        }
    }


@router.get("/profile/{user_id}", response_model=CHWResponse)
async def get_profile(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get CHW staff profile."""
    
    result = await db.execute(
        select(CHWStaff).where(CHWStaff.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user
