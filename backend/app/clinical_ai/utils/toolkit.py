import logging
from typing import Any, Dict, Callable

logger = logging.getLogger(__name__)

MAX_RETRIES = 2

def _retry_tool(tool_fn: Callable, *args: Any, tool_name: str = "tool", **kwargs: Any) -> Dict[str, Any]:
    """Execute a tool with retry logic. Returns result or raises on final failure."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            return tool_fn(*args, **kwargs)
        except Exception as e:
            if attempt < MAX_RETRIES:
                logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} for {tool_name}: {e}")
                continue
            raise
