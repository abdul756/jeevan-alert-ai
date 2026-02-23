"""
CHW Clinical Decision Support System - Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import logging

from .core.config import settings
from .core.database import init_db, close_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Offline Mode: {settings.offline_mode}")
    logger.info("LangGraph + MedGemma Tool-Based Orchestrator Active")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Initialize Ollama model manager (eager load)
    from .core.medgemma_tools import get_medgemma_toolkit
    toolkit = get_medgemma_toolkit()
    try:
        _ = toolkit.chw_llm  # Trigger eager load
    except Exception:
        pass
    model_info = toolkit.get_model_info()
    logger.info(f"Model Manager Status: {model_info['status']}")
    if model_info['status'] == 'loaded':
        logger.info(f"Model: {model_info['model']}")
    else:
        logger.warning("Ollama model not loaded - running in DEMO mode")
        logger.warning("Start Ollama with: ollama serve")

    logger.info("=" * 60)
    logger.info("CHW Clinical Decision Support System")
    logger.info("11 REST APIs Active")
    logger.info("7 MedGemma Tools Operational")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Shutting down application...")
    await close_db()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Clinical Decision Support System for Community Health Workers with MedGemma-Powered Tool-Based Orchestrator",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static file serving for uploaded images
uploads_dir = Path(__file__).parent.parent / "uploads"
uploads_dir.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
logger.info(f"Static file serving enabled: {uploads_dir}")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from .core.medgemma_tools import get_medgemma_toolkit
    toolkit = get_medgemma_toolkit()
    model_info = toolkit.get_model_info()
    
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "offline_mode": settings.offline_mode,
        "model_backend": "ollama",
        "model_status": model_info['status'],
        "apis_active": 11,
        "tools_active": 7
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "architecture": "LangGraph + MedGemma Tool-Based Orchestrator",
        "apis": {
            "documentation": "/docs",
            "health": "/health",
            "auth": "/api/v1/auth/register",
            "workflow": "/api/v1/workflow/execute-tool-workflow",
            "patients": "/api/v1/patients",
            "analytics": "/api/v1/analytics/dashboard"
        },
        "features": [
            "7 MedGemma Clinical Tools",
            "11 REST API Endpoints",
            "CHW Authentication & Registration",
            "Offline-First Architecture",
            "AI-Powered Clinical Assessment",
            "AI-Powered SOAP Notes"
        ]
    }


# Include API routers
from .api.v1 import (
    auth,
    patients,
    encounters,
    observations,
    analytics,
    offline_sync,
    skin_analysis,
    system_testing,
)
from .clinical_ai.routers import workflow_router, chat_router

# Authentication (First!)
app.include_router(
    auth.router,
    prefix=f"{settings.api_v1_prefix}/auth",
    tags=["authentication"]
)

# Patient Management
app.include_router(
    patients.router,
    prefix=f"{settings.api_v1_prefix}/patients",
    tags=["patients"]
)

# Clinical Encounters
app.include_router(
    encounters.router,
    prefix=f"{settings.api_v1_prefix}/encounters",
    tags=["encounters"]
)

# Observations & Vitals
app.include_router(
    observations.router,
    prefix=f"{settings.api_v1_prefix}/observations",
    tags=["observations"]
)


# Analytics & Reporting
app.include_router(
    analytics.router,
    prefix=f"{settings.api_v1_prefix}/analytics",
    tags=["analytics"]
)

# Skin Lesion Analysis (ISIC MedGemma via Ollama)
app.include_router(
    skin_analysis.router,
    prefix=f"{settings.api_v1_prefix}/skin-analysis",
    tags=["skin-analysis"]
)

# Offline Sync
app.include_router(
    offline_sync.router,
    prefix=f"{settings.api_v1_prefix}/sync",
    tags=["offline-sync"]
)

# LangGraph Workflow (Main AI System)
app.include_router(
    workflow_router.router,
    prefix=f"{settings.api_v1_prefix}/workflow",
    tags=["langgraph-workflow"]
)

# System Testing & Validation
app.include_router(
    system_testing.router,
    prefix=f"{settings.api_v1_prefix}/testing",
    tags=["system-testing"]
)

# JeevanAlert AI Chat (medgemma-1.5-4b-it streaming)
app.include_router(
    chat_router.router,
    prefix=f"{settings.api_v1_prefix}/chat",
    tags=["jeevanalert-chat"]
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
