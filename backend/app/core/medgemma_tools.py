"""
MedGemma Toolkit Core

This module provides the core connection handler and JSON parsing utilities for the
MedGemma LLM workflow. It manages the connections to the Ollama backend and provides
handlers for three distinct models:

1. `chw_llm`: Fine-tuned MedGemma-CHW (Ollama, text-only). Used by the specialized clinical tools via `_invoke`.
2. `isic_llm`: Fine-tuned ISIC MedGemma (Ollama multimodal, vision+text). Used by the SkinCancerDetectionTool.
3. `chat_llm`: Pretrained general MwanzoScan Chat model. Used by the streaming chat router.

Specific clinical tools (e.g., Clinical Assessment, SOAP Note Generation) are
implemented as OOP adapters in `app/clinical_ai/tools/` and use this toolkit
for executing LLM prompts.
"""
from langchain_ollama import OllamaLLM, ChatOllama
from typing import Dict, Any, List, Optional
import json
import re
import logging

from ..core.config import settings
from ..core.output_parser import SanitizedOutputParser

logger = logging.getLogger(__name__)


_parser = SanitizedOutputParser()


def _extract_balanced_blocks(text: str) -> list:
    """Extract balanced {...} blocks using brace counting (not regex)."""
    blocks = []
    depth = 0
    start = -1
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                blocks.append(text[start:i + 1])
                start = -1
    return blocks


def _parse_json(text: str) -> Dict[str, Any]:
    """
    Parse JSON from model output.
    Handles split objects, chat artifacts, restart patterns, and malformed strings.
    """
    # 1. Pre-sanitize using the custom parser logic
    raw_cleaned = _parser.parse(text).strip()

    # 2. Fast path: try direct parse
    try:
        return json.loads(raw_cleaned, strict=False)
    except json.JSONDecodeError:
        pass

    # 3. Restart-pattern recovery
    # MedGemma sometimes outputs partial JSON, then <start_of_turn>model, then
    # the complete JSON again. After artifact removal we get two concatenated
    # fragments where the LAST one is typically the complete object.
    # Try parsing from each '{' position, last-to-first.
    positions = [m.start() for m in re.finditer(r'\{', raw_cleaned)]
    for pos in reversed(positions):
        candidate = raw_cleaned[pos:]
        try:
            obj = json.loads(candidate, strict=False)
            if isinstance(obj, dict) and obj:
                logger.info("Recovered JSON from restart pattern.")
                return obj
        except json.JSONDecodeError:
            # Trim trailing garbage after the last }
            last_brace = candidate.rfind('}')
            if last_brace > 0:
                try:
                    obj = json.loads(candidate[:last_brace + 1], strict=False)
                    if isinstance(obj, dict) and obj:
                        logger.info("Recovered JSON from restart pattern (trimmed).")
                        return obj
                except json.JSONDecodeError:
                    continue

    # 4. Multi-block merge using balanced-brace extraction
    # MedGemma sometimes outputs SOAP sections as separate { } blocks.
    merged_result = {}
    found_blocks = _extract_balanced_blocks(raw_cleaned)

    if found_blocks:
        for block in found_blocks:
            try:
                obj = json.loads(block, strict=False)
                if isinstance(obj, dict):
                    merged_result.update(obj)
            except json.JSONDecodeError:
                try:
                    fixed_block = block
                    if fixed_block.count('"') % 2 != 0: fixed_block += '"'
                    fixed_block += "}" * (fixed_block.count("{") - fixed_block.count("}"))
                    obj = json.loads(fixed_block, strict=False)
                    merged_result.update(obj)
                except Exception:
                    continue

        if merged_result:
            logger.info(f"Successfully merged {len(found_blocks)} JSON block(s).")
            return merged_result

    # 5. Final fallback
    logger.warning(f"Failed to parse JSON: {raw_cleaned[:100]}...")
    return {}


class MedGemmaToolkit:
    """Core LLM interface for MedGemma tools, handling invocation and parsing."""

    def __init__(self):
        self._chw_llm = None
        self._isic_llm = None
        self._chat_llm = None
        logger.info("MedGemma Toolkit initialized")

    @property
    def chw_llm(self) -> OllamaLLM:
        """Lazy-load CHW workflow LLM (text-only, strict formatting)."""
        if self._chw_llm is None:
            self._chw_llm = OllamaLLM(
                model=settings.ollama_model_name,
                temperature=settings.model_temperature,
                num_ctx=settings.max_model_context_length,
                num_predict=2048,
                stop=["<end_of_turn>"],
            )
            logger.info(f"CHW LLM loaded: {settings.ollama_model_name}")
        return self._chw_llm

    @property
    def isic_llm(self) -> ChatOllama:
        """Lazy-load ISIC skin cancer LLM (multimodal Chat interface)."""
        if self._isic_llm is None:
            self._isic_llm = ChatOllama(
                model=settings.isic_ollama_model,
                temperature=0.1,  # Low temp for clinical reasoning
                num_predict=600,
                num_ctx=512,  # Added to prevent OOM
            )
            logger.info(f"ISIC Vision LLM loaded: {settings.isic_ollama_model}")
        return self._isic_llm

    @property
    def chat_llm(self) -> ChatOllama:
        """Lazy-load Pretrained MwanzoScan Chat LLM (streaming text + multimodal)."""
        if self._chat_llm is None:
            self._chat_llm = ChatOllama(
                model=settings.chat_ollama_model,
                temperature=0.3,
                num_predict=800,
                num_ctx=512,  # Added to prevent OOM
            )
            logger.info(f"MwanzoScan Chat LLM loaded: {settings.chat_ollama_model}")
        return self._chat_llm

    def _invoke(self, prompt: str) -> Dict[str, Any]:
        """Send prompt to CHW LLM and parse JSON response."""
        response = self.chw_llm.invoke(prompt)
        logger.info(f"LLM response ({len(response)} chars): {response}")
        return _parse_json(response)

    def get_model_info(self) -> Dict[str, Any]:
        """Return model status info for the primary workflow model."""
        try:
            llm = self.chw_llm
            return {
                "status": "loaded",
                "model": llm.model,
                "temperature": llm.temperature,
                "context_length": llm.num_ctx,
                "backend": "ollama",
            }
        except Exception:
            return {"status": "not_loaded", "model": None, "backend": "ollama"}
            
    def reinitialize(self) -> bool:
        """Force reload caching."""
        self._chw_llm = None
        self._isic_llm = None
        self._chat_llm = None
        try:
            _ = self.chw_llm
            return True
        except Exception:
            return False

_toolkit_instance = None


def get_medgemma_toolkit() -> MedGemmaToolkit:
    """Get singleton MedGemma toolkit instance."""
    global _toolkit_instance
    if _toolkit_instance is None:
        _toolkit_instance = MedGemmaToolkit()
    return _toolkit_instance
