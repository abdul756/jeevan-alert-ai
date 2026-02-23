from typing import Dict, List, Type, Any
from .tools import BaseClinicalTool
import logging

logger = logging.getLogger(__name__)

class ToolRegistry:
    """
    Registry for dynamic clinical tools in the MedGemma workflow.
    """
    def __init__(self):
        self._tools: Dict[str, BaseClinicalTool] = {}

    def register(self, tool: BaseClinicalTool):
        """Register a new tool instance."""
        if tool.name in self._tools:
            logger.warning(f"Overwriting existing tool registration for: {tool.name}")
        self._tools[tool.name] = tool
        logger.info(f"Registered tool: {tool.name}")

    def get_tool(self, name: str) -> BaseClinicalTool:
        """Get a tool by its node name."""
        if name not in self._tools:
            raise KeyError(f"Tool not found: {name}")
        return self._tools[name]

    def get_all_tools(self) -> List[BaseClinicalTool]:
        """Get all registered tool instances."""
        return list(self._tools.values())

    def get_tool_descriptions(self) -> List[Dict[str, str]]:
        """Get metadata for all tools (for the Orchestrator prompt)."""
        return [tool.get_metadata() for tool in self._tools.values()]

# Global Singleton Registry
registry = ToolRegistry()
