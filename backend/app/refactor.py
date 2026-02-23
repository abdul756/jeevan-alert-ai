import sys
import os

os.makedirs('/home/abdul/medagents/backend/app/clinical_ai/orchestrator', exist_ok=True)
os.makedirs('/home/abdul/medagents/backend/app/clinical_ai/routers', exist_ok=True)

with open('/home/abdul/medagents/backend/app/agents/tool_based_workflow.py') as f:
    lines = f.readlines()

agent_imports = '''import logging
import json
from typing import Dict, Any

from ..domain.state import ToolBasedWorkflowState
from .progress import _emit_progress
from ...core.medgemma_tools import get_medgemma_toolkit, _parse_json

logger = logging.getLogger(__name__)

'''
with open('/home/abdul/medagents/backend/app/clinical_ai/orchestrator/agent.py', 'w') as f:
    f.write(agent_imports + "".join(lines[131:353]))

nodes_imports = '''import logging
import json
from datetime import datetime
from typing import Dict, Any

from ..domain.state import ToolBasedWorkflowState
from .progress import _emit_progress
from .utils.toolkit import _retry_tool
from ...core.medgemma_tools import get_medgemma_toolkit

logger = logging.getLogger(__name__)

'''
with open('/home/abdul/medagents/backend/app/clinical_ai/orchestrator/nodes.py', 'w') as f:
    f.write(nodes_imports + "".join(lines[354:922]))

graph_imports = '''import logging
import asyncio
import sqlite3
from typing import Dict, Any, Optional

from langgraph.graph import StateGraph, END
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain.state import ToolBasedWorkflowState
from .agent import orchestrator_agent
from .nodes import (
    execute_clinical_assessment,
    emergency_confirmation_gate,
    execute_emergency_protocol,
    execute_risk_assessment,
    execute_referral_decision,
    execute_parallel_risk_referral,
    execute_treatment_plan,
    execute_soap_note_generation,
    execute_skin_cancer_detection,
)
from ...models.encounter import Encounter
from ...models.patient import Patient
from ...models.observation import Observation

try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    _sqlite_conn = sqlite3.connect("workflow_checkpoints.db", check_same_thread=False)
    _checkpointer_backend = SqliteSaver(_sqlite_conn)
    logger_tmp = logging.getLogger(__name__)
    logger_tmp.info("Checkpointer: SqliteSaver (persistent across restarts)")
except Exception as _e:
    from langgraph.checkpoint.memory import MemorySaver
    _checkpointer_backend = MemorySaver()
    logger_tmp = logging.getLogger(__name__)
    logger_tmp.warning(f"SqliteSaver unavailable ({_e}), falling back to MemorySaver")

logger = logging.getLogger(__name__)

'''
with open('/home/abdul/medagents/backend/app/clinical_ai/orchestrator/graph.py', 'w') as f:
    f.write(graph_imports + "".join(lines[927:1122]))
