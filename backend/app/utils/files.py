"""
File / directory helpers for temp storage.
"""

import os
import shutil
from pathlib import Path


DATA_ROOT = Path("data")
TEMP_ROOT = Path("temp")


def ensure_paper_dirs(paper_id: str) -> dict[str, str]:
    """Create and return standard directory paths for a paper."""
    dirs = {
        "source": str(TEMP_ROOT / "sources" / paper_id),
        "slides": str(TEMP_ROOT / "slides" / paper_id),
        "audio": str(TEMP_ROOT / "audio" / paper_id),
        "video": str(TEMP_ROOT / "video" / paper_id),
        "images": str(TEMP_ROOT / "slides" / paper_id / "images"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)
    return dirs


def cleanup_paper(paper_id: str):
    """Remove all temp data for a paper."""
    for sub in ("sources", "slides", "audio", "video"):
        path = TEMP_ROOT / sub / paper_id
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
