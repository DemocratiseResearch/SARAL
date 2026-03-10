"""PDF text and image extraction via PyMuPDF (fitz)."""

import os
import re
import shutil
import logging
from typing import Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


def process_pdf(pdf_path: str, paper_dir: str) -> dict:
    """
    Extract text, images, and metadata from a PDF.

    Args:
        pdf_path: Path to the uploaded PDF.
        paper_dir: Directory to save extracted content into.

    Returns:
        dict with keys: metadata, text_file_path, source_dir, image_files, pdf_path
    """
    source_dir = os.path.join(paper_dir, "source")
    image_dir = os.path.join(source_dir, "images")
    os.makedirs(image_dir, exist_ok=True)

    doc = fitz.open(pdf_path)

    metadata = _extract_metadata(doc)
    full_text = "\n\n".join(page.get_text() for page in doc)
    image_files = _extract_images(doc, image_dir)

    # Save extracted text
    text_path = os.path.join(source_dir, "extracted_text.txt")
    with open(text_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    # Keep a copy of the original PDF
    pdf_copy = os.path.join(source_dir, "paper.pdf")
    shutil.copy(pdf_path, pdf_copy)

    doc.close()

    return {
        "metadata": metadata,
        "text_file_path": text_path,
        "source_dir": source_dir,
        "image_files": image_files,
        "pdf_path": pdf_copy,
    }


def _extract_metadata(doc: fitz.Document) -> dict:
    metadata = {"title": "Research Paper", "authors": "Author", "date": ""}

    if doc.metadata:
        if doc.metadata.get("title"):
            metadata["title"] = doc.metadata["title"]
        if doc.metadata.get("author"):
            metadata["authors"] = doc.metadata["author"]
        for field in ("creationDate", "modDate"):
            val = doc.metadata.get(field, "")
            if val:
                metadata["date"] = val[2:6] if val.startswith("D:") else val
                break

    # Fallback: first non-empty line of first page as title
    if metadata["title"] == "Research Paper" and len(doc) > 0:
        for line in doc[0].get_text().split("\n"):
            if line.strip():
                metadata["title"] = line.strip()
                break

    return metadata


def _extract_images(doc: fitz.Document, output_dir: str) -> list[str]:
    image_files: list[str] = []

    for page_idx, page in enumerate(doc):
        for img_idx, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            base_image = doc.extract_image(xref)
            ext = base_image["ext"]
            if ext.lower() == "jpeg":
                ext = "jpg"

            filename = f"image_{page_idx + 1}_{img_idx + 1}.{ext}"
            path = os.path.join(output_dir, filename)
            with open(path, "wb") as f:
                f.write(base_image["image"])
            image_files.append(path)

    return image_files
