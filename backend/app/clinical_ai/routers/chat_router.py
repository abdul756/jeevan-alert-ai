"""
JeevanAlert AI Chat — Streaming SSE endpoint
Uses medgemma-1.5-4b-it via Ollama for conversational medical imaging assistance.
Supports both text-only and multimodal (image + text) requests.
"""
from fastapi import APIRouter, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from typing import Optional
import base64
import logging
import json
from langchain_core.messages import HumanMessage
from ...core.medgemma_tools import get_medgemma_toolkit

router = APIRouter()
logger = logging.getLogger(__name__)

def _sse(event: dict) -> str:
    """Format a dict as a single SSE data frame."""
    return f"data: {json.dumps(event)}\n\n"


async def _stream_generator(message: str, image_bytes: Optional[bytes]):
    """
    Async generator that yields SSE-formatted strings.
    - Image present: sends image + prompt to medgemma-1.5-4b-it (multimodal)
    - Text only:     sends prompt to medgemma-1.5-4b-it (text)
    Falls back to a demo message if Ollama is unreachable.
    """
    try:
        toolkit = get_medgemma_toolkit()
        chat_llm = toolkit.chat_llm
        
        if image_bytes is not None:
            yield _sse({"type": "status", "content": "Analyzing image..."})
            prompt = (
                "You are JeevanAlert AI, a medical imaging assistant. "
                "Analyze this medical image carefully and provide clinical insights, "
                "key findings, and any relevant recommendations.\n\n"
                f"User question: {message or 'Describe the findings in this image.'}"
            )
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            msg = HumanMessage(content=[
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
            ])
        else:
            prompt = (
                "You are JeevanAlert AI, a medical imaging and clinical assistant. "
                f"Answer the following concisely and accurately:\n\n{message}"
            )
            msg = HumanMessage(content=prompt)

        async for chunk in chat_llm.astream([msg]):
            if chunk.content:
                yield _sse({"type": "token", "content": chunk.content})

        yield _sse({"type": "done"})

    except Exception as exc:
        logger.error(f"JeevanAlert chat stream error: {exc}")
        yield _sse({"type": "error", "content": str(exc)})
        yield _sse({
            "type": "token",
            "content": (
                "[DEMO] Ollama is not reachable. "
                "Start it with `ollama serve` and ensure the model is pulled."
            ),
        })
        yield _sse({"type": "done"})


@router.post("/")
async def jeevanalert_chat(
    message: str = Form(""),
    image: Optional[UploadFile] = File(None),
):
    """
    Streaming SSE endpoint for JeevanAlert AI chat widget.
    Uses medgemma-1.5-4b-it via Ollama for both text and image requests.

    Request: multipart/form-data
      - message (str): user's question or prompt
      - image (file, optional): medical image to analyze

    Response: text/event-stream with JSON frames:
      {"type": "status",  "content": "..."}  — setup phase (image requests only)
      {"type": "token",   "content": "..."}  — each streamed token
      {"type": "done"}                        — stream complete
      {"type": "error",   "content": "..."}  — on failure (followed by demo token + done)
    """
    from ...core.config import settings

    image_bytes: Optional[bytes] = None
    if image is not None:
        if image.content_type and not image.content_type.startswith("image/"):
            async def _type_err():
                yield _sse({"type": "error", "content": "Uploaded file must be an image."})
                yield _sse({"type": "done"})
            return StreamingResponse(_type_err(), media_type="text/event-stream")

        image_bytes = await image.read()
        max_bytes = settings.max_image_size_mb * 1024 * 1024
        if len(image_bytes) > max_bytes:
            async def _size_err():
                yield _sse({"type": "error", "content": f"Image exceeds {settings.max_image_size_mb} MB limit."})
                yield _sse({"type": "done"})
            return StreamingResponse(_size_err(), media_type="text/event-stream")

    return StreamingResponse(
        _stream_generator(message, image_bytes),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
