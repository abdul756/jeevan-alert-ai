import re
import json
import logging
from typing import List, Dict, Any
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

# MedGemma chat artifacts to remove
MEDGEMMA_ARTIFACTS = [
    "<start_of_turn>model\n",
    "<start_of_turn>model",
    "<start_of_turn>user\n",
    "<start_of_turn>user",
    "<start_of_turn>",
    "<end_of_turn>",
    "```json",
    "```"
]

class SanitizedOutputParser(StrOutputParser):
    """
    Advanced parser that breaks keys out of swallowed strings and
    cleans MedGemma chat artifacts.
    """

    def parse(self, text: str) -> str:
        cleaned = super().parse(text)

        # 1. Remove artifacts
        for artifact in MEDGEMMA_ARTIFACTS:
            cleaned = cleaned.replace(artifact, '')

        # 2. Fix Swallowed Keys
        # Pattern: [some text], [key]": 
        # Goal: Close the previous string and open the new key correctly.
        # Example: male, triage_level": -> male", "triage_level":
        cleaned = re.sub(
            r'([^"]+),\s*([a-z_]+)":', 
            r'\1", "\2":', 
            cleaned
        )

        # 3. Fix Unquoted Keys
        # Ensures keys following a comma or brace have their opening quote.
        # Example: ,red_flags": -> , "red_flags":
        cleaned = re.sub(r'([,{]\s*)([a-z_]+)":', r'\1"\2":', cleaned)

        # 4. Clean up double quotes or trailing commas created by regex
        cleaned = cleaned.replace('"",', '",').replace('""', '"')
        
        return cleaned.strip()
