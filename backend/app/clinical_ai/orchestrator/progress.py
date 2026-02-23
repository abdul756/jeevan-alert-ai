import queue as _stdlib_queue
from typing import Dict

# Thread-safe queues keyed by encounter_id for SSE progress streaming
# Tool nodes (running in threads) push events; SSE endpoint drains and streams
_progress_queues: Dict[str, _stdlib_queue.SimpleQueue] = {}

def _emit_progress(encounter_id: str, event: dict) -> None:
    """Emit a progress event to the SSE queue (thread-safe, no-op if no listener)."""
    q = _progress_queues.get(encounter_id)
    if q is not None:
        q.put(event)
