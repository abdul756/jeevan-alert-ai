from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json

from .state import ToolBasedWorkflowState

class BaseClinicalTool(ABC):
    """
    Abstract base class for all clinical workflow tools.
    Developers can subclass this to add new tools to the orchestrator.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the tool (e.g., 'clinical_assessment'). This is the node name in LangGraph."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what the tool does. Given to the orchestrator."""
        pass

    @property
    @abstractmethod
    def use_when(self) -> str:
        """Guidance for the orchestrator on when to use this tool."""
        pass

    @abstractmethod
    def execute(self, state: ToolBasedWorkflowState, toolkit: Any) -> Dict[str, Any]:
        """
        Execute the tool. Returns a dictionary containing updates to the workflow state.
        Must handle its own retries and errors (or use a shared registry helper),
        and must emit progress events if applicable.
        """
        pass

    @abstractmethod
    def get_fallback_state(self, state: ToolBasedWorkflowState, error: Exception) -> Dict[str, Any]:
        """
        Return a safe fallback state if the tool completely fails after retries.
        """
        pass

    @abstractmethod
    def is_complete(self, state: ToolBasedWorkflowState) -> bool:
        """
        Check if the tool has already successfully populated the state.
        Used by the orchestrator to filter available tools.
        """
        pass

    def get_metadata(self) -> Dict[str, str]:
        """Tool metadata for the orchestrator agent."""
        return {
            "name": self.name,
            "description": self.description,
            "use_when": self.use_when,
        }
