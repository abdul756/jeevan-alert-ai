"""
Skin Lesion Analysis API — Charma Scan
Analyzes dermoscopic images using fine-tuned ISIC MedGemma via Ollama.

Model lifecycle:
  - Before inference: loads isic-medgemma into VRAM
  - After inference:  unloads it (keep_alive=0) so medgemma-chw can reclaim VRAM
"""
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
import json
import re

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Response Schemas ────────────────────────────────────────────

class SkinAnalysisResponse(BaseModel):
    classification: str
    confidence: float
    reasoning: str
    requires_referral: bool
    urgency: str
    model: str
    raw_output: Optional[str] = None
    metadata_used: Optional[Dict[str, Any]] = None


class SkinAnalysisStatus(BaseModel):
    available: bool
    model_name: str
    message: str


# ─── Prompt helpers ──────────────────────────────────────────────

def _format_metadata(
    age: Optional[str] = None,
    sex: Optional[str] = None,
    site: Optional[str] = None,
    size_mm: Optional[str] = None,
) -> str:
    return (
        f"Patient: {age or 'unknown'} year old {sex or 'unknown'}\n"
        f"Lesion site: {site or 'unknown'}, size: {size_mm or 'unknown'} mm\n"
    )


def _build_prompt(metadata_text: str = "") -> str:
    return (
        "Analyze this dermoscopic skin lesion image for signs of malignancy.\n"
        f"{metadata_text}"
        'Provide your assessment as JSON: '
        '{"classification": "benign" or "malignant", '
        '"confidence": 0.0-1.0, '
        '"reasoning": "brief explanation"}'
    )


def _parse_response(text: str) -> dict:
    """Parse model JSON output with regex fallback."""
    # Try direct JSON extraction
    try:
        match = re.search(r'\{[^{}]*\}', text)
        if match:
            parsed = json.loads(match.group())
            if "classification" in parsed and "confidence" in parsed:
                return parsed
    except json.JSONDecodeError:
        pass

    # Regex fallback
    result = {"classification": "benign", "confidence": 0.5, "reasoning": ""}

    cls = re.search(r'"classification"\s*:\s*"(malignant|benign)"', text, re.IGNORECASE)
    if cls:
        result["classification"] = cls.group(1).lower()
    elif "malignant" in text.lower() and "benign" not in text.lower():
        result["classification"] = "malignant"

    conf = re.search(r'"confidence"\s*:\s*(0?\.\d+|1\.0|1)', text)
    if conf:
        result["confidence"] = float(conf.group(1))

    reason = re.search(r'"reasoning"\s*:\s*"([^"]*)"', text)
    if reason:
        result["reasoning"] = reason.group(1)

    return result


def _assess_urgency(classification: str, confidence: float) -> tuple:
    if classification == "malignant":
        return "urgent", True
    return "routine", False


# ─── Ollama model lifecycle ───────────────────────────────────────

def _get_ollama_client():
    """Import and return ollama client, raising 503 if not installed."""
    try:
        import ollama
        return ollama
    except ImportError:
        raise HTTPException(status_code=503, detail="ollama package not installed")


def _load_model(client, model_name: str):
    """
    Pre-load the model into VRAM before inference.
    Uses a minimal generate call with keep_alive to warm the model.
    """
    try:
        logger.info(f"🔄 Loading {model_name} into VRAM...")
        # A blank prompt with keep_alive loads the model without generating
        client.generate(model=model_name, prompt="", keep_alive="5m")
        logger.info(f"✅ {model_name} loaded")
    except Exception as e:
        logger.warning(f"⚠️ Pre-load of {model_name} failed (will try inference anyway): {e}")


def _unload_model(client, model_name: str):
    """
    Unload model from VRAM after inference to free GPU memory.
    Uses keep_alive=0 which tells Ollama to immediately release the model.
    """
    try:
        logger.info(f"🔄 Unloading {model_name} from VRAM...")
        client.generate(model=model_name, prompt="", keep_alive=0)
        logger.info(f"✅ {model_name} unloaded — VRAM freed")
    except Exception as e:
        logger.warning(f"⚠️ Unload of {model_name} failed: {e}")


# ─── Endpoints ───────────────────────────────────────────────────

@router.post("/analyze", response_model=SkinAnalysisResponse)
async def analyze_skin_lesion(
    image: UploadFile = File(...),
    age: Optional[str] = Form(None),
    sex: Optional[str] = Form(None),
    site: Optional[str] = Form(None),
    size_mm: Optional[str] = Form(None),
):
    """
    Analyze a skin lesion image using ISIC MedGemma.
    Loads the model before analysis and unloads it after to free VRAM.
    """
    from ...core.config import settings

    # Validate image
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG)")

    image_bytes = await image.read()
    max_size = settings.max_image_size_mb * 1024 * 1024
    if len(image_bytes) > max_size:
        raise HTTPException(status_code=400, detail=f"Image exceeds {settings.max_image_size_mb}MB limit")

    metadata_text = _format_metadata(age, sex, site, size_mm)
    prompt = _build_prompt(metadata_text)
    metadata_used = {"age": age, "sex": sex, "site": site, "size_mm": size_mm}
    model_name = settings.isic_ollama_model
    chw_model = settings.ollama_model_name  # medgemma-chw

    client = _get_ollama_client()

    try:
        # Step 1: Unload medgemma-chw to free VRAM for the ISIC model
        _unload_model(client, chw_model)

        # Step 2: Load ISIC model into VRAM
        _load_model(client, model_name)

        # Step 3: Run inference
        logger.info(f"🔍 Running skin analysis with {model_name}...")
        response = client.generate(
            model=model_name,
            prompt=prompt,
            images=[image_bytes],
            options={"temperature": 0.1, "num_predict": 200},
            keep_alive=0,  # Unload immediately after this request
        )
        raw_output = response.get("response", "")
        logger.info(f"📋 Raw output: {raw_output}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ollama inference failed: {e}")
        return SkinAnalysisResponse(
            classification="benign",
            confidence=0.5,
            reasoning=f"[DEMO] Ollama not available: {e}",
            requires_referral=False,
            urgency="routine",
            model=f"{model_name} (demo)",
            raw_output="",
            metadata_used=metadata_used,
        )
    finally:
        # Step 4: Unload ISIC model and re-warm medgemma-chw
        _unload_model(client, model_name)
        _load_model(client, chw_model)

    # Parse and return
    parsed = _parse_response(raw_output)
    urgency, requires_referral = _assess_urgency(parsed["classification"], parsed["confidence"])

    return SkinAnalysisResponse(
        classification=parsed["classification"],
        confidence=parsed["confidence"],
        reasoning=parsed.get("reasoning", ""),
        requires_referral=requires_referral,
        urgency=urgency,
        model=model_name,
        raw_output=raw_output,
        metadata_used=metadata_used,
    )


@router.get("/status", response_model=SkinAnalysisStatus)
async def skin_analysis_status():
    """Check if ISIC MedGemma model is registered in Ollama."""
    from ...core.config import settings

    try:
        client = _get_ollama_client()
        models = client.list()
        model_list = models.get("models", [])
        model_names = [m.get("name", "") if isinstance(m, dict) else str(m) for m in model_list]
        available = any(settings.isic_ollama_model in n for n in model_names)
        return SkinAnalysisStatus(
            available=available,
            model_name=settings.isic_ollama_model,
            message="Model ready" if available else "Model not registered in Ollama",
        )
    except HTTPException:
        raise
    except Exception as e:
        return SkinAnalysisStatus(
            available=False,
            model_name=settings.isic_ollama_model,
            message=f"Ollama not reachable: {e}",
        )
