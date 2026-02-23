"""
Database configuration and session management.
Uses SQLAlchemy with async SQLite for local-first architecture.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
from .config import settings


# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    future=True
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting database session.
    
    Yields:
        AsyncSession: Database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight migration: add ai_assessment_data column if it doesn't exist
        # (create_all won't add columns to existing tables in SQLite)
        try:
            await conn.execute(
                __import__('sqlalchemy').text(
                    "ALTER TABLE encounters ADD COLUMN ai_assessment_data JSON"
                )
            )
        except Exception:
            pass  # Column already exists


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
