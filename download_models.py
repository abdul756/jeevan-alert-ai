"""
Download all MedGemma models from HuggingFace.

Usage:
    pip install -q huggingface_hub
    python download_models.py
"""

from huggingface_hub import hf_hub_download

REPO_ID = "manaf/finetuned-medgemma-1.5-4b-it"

FILES = [
    "finetuned/medgemma-chw/medgemma-chw-q4_k_m.gguf",
    "finetuned/medgemma-chw/Modelfile",
    "finetuned/isic-medgemma/medgemma-isic-Q4_K_M.gguf",
    "finetuned/isic-medgemma/mmproj-medgemma-isic-f16.gguf",
    "finetuned/isic-medgemma/Modelfile",
    "pretrained/medgemma-1.5-4b-it/medgemma-1.5-4b-it-Q4_1.gguf",
    "pretrained/medgemma-1.5-4b-it/mmproj-F16.gguf",
    "pretrained/medgemma-1.5-4b-it/Modelfile",
]

for f in FILES:
    print(f"Downloading {f}...")
    hf_hub_download(repo_id=REPO_ID, filename=f, local_dir="ai_models")

print("All done!")
