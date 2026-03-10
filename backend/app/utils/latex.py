"""LaTeX file processing — find .tex files, extract metadata, images, and text."""

import os
import re
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def find_tex_file(directory: str) -> str:
    """Find the main .tex file (the one with \\documentclass) in a directory tree."""
    tex_files: list[str] = []
    for root, _, files in os.walk(directory):
        for f in files:
            if f.endswith(".tex"):
                tex_files.append(os.path.join(root, f))

    if not tex_files:
        raise FileNotFoundError("No .tex files found in the directory")

    # Prefer file containing \documentclass
    for path in tex_files:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                if "\\documentclass" in fh.read():
                    return path
        except Exception:
            continue

    return tex_files[0]


def extract_metadata_from_tex(tex_path: str) -> dict:
    """Extract title, authors, date from LaTeX commands."""
    metadata = {"title": "Research Paper", "authors": "Author", "date": ""}
    try:
        with open(tex_path, "r", encoding="utf-8") as f:
            content = f.read()

        m = re.search(r"\\title\{([^}]+)\}", content)
        if m:
            metadata["title"] = m.group(1).strip()

        m = re.search(r"\\author\{([^}]+)\}", content)
        if m:
            metadata["authors"] = m.group(1).strip()

        m = re.search(r"\\date\{([^}]+)\}", content)
        if m:
            metadata["date"] = m.group(1).strip()
    except Exception as e:
        logger.warning(f"Error extracting LaTeX metadata: {e}")

    return metadata


def extract_text_from_file(file_path: str) -> str:
    """Read and clean text from a .tex or .txt file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        logger.error(f"Could not read {file_path}: {e}")
        return ""

    if file_path.endswith(".txt"):
        return content

    # Strip LaTeX commands for plain text
    content = re.sub(r"%.*?\n", "\n", content)
    content = re.sub(r"\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})*", " ", content)
    content = re.sub(r"\{[^}]*\}", " ", content)
    content = re.sub(r"\s+", " ", content)
    return content.strip()


def find_image_files(directory: str) -> list[str]:
    """Collect all image files in a directory tree."""
    extensions = {".png", ".jpg", ".jpeg", ".gif", ".svg"}
    images: list[str] = []
    for root, _, files in os.walk(directory):
        for f in files:
            if Path(f).suffix.lower() in extensions:
                images.append(os.path.join(root, f))
    return images
