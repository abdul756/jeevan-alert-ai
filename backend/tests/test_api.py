"""
Test suite for REST API endpoints.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    """Test health check endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "apis_active" in data


@pytest.mark.asyncio
async def test_create_patient():
    """Test patient creation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_data = {
            "name": "John Doe",
            "date_of_birth": "1980-01-01",
            "gender": "Male",
            "mobile": "555-0100"
        }
        response = await client.post("/api/v1/patients", json=patient_data)
        assert response.status_code == 201
        data = response.json()
        assert "John" in data["name"]
        assert "id" in data


@pytest.mark.asyncio
async def test_get_dashboard_analytics():
    """Test analytics dashboard endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "total_patients" in data["summary"]


@pytest.mark.asyncio
async def test_sync_health():
    """Test offline sync health endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/sync/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "operational"
        assert data["offline_mode_enabled"] is True
