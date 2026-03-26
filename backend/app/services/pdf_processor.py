from datetime import datetime
import logging
from pathlib import Path
import shutil
import time
from typing import Dict, List, Literal
import asyncio
from functools import partial
import re

from pydantic import (
    BaseModel,
    Field,
    SecretStr,
    field_serializer,
    field_validator,
)
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider


from saraldocling import parse_pdf, ParseConfig

_log = logging.getLogger(__name__)



class PaperDetails(BaseModel):

    title: str = Field(
        default="Research Paper",
        description="The title of the provided paper.",
    )
    authors: str = Field(
        default_factory=lambda: ["Authors"],
        description="The authors of the provided paper.",
    )
    date: str = Field(
        default="1 Jan 2025",
        description="The publication date of the provided paper in the format 'dd mmm yyyy'.",
        examples=["1 Jan 2025", "23 Sep 1994", "3 Jun 2021"],
    )

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str):
        print("v1", v)
        return v

    @field_validator("authors", mode="before")
    @classmethod
    def collapse_authors(cls, authors):
        if not authors:
            return "Authors"
        print("authors", authors)
        if isinstance(authors, list):
            print("length of authors", len(authors))
            return f"{authors[0]} et al." if len(authors) > 1 else authors[0]

        if isinstance(authors, str):
            parts = [a.strip() for a in re.split(r"[;,]", authors) if a.strip()]
            print("parts in authors:", parts)
            if len(parts) > 1:
                return f"{parts[0]} et al."
            return parts[0]

        return "Authors"


class PatentDetails(BaseModel):
    """Always use this tool to structure your response."""

    title: str = Field(
        default="Patent", description="The title of the provided patent."
    )
    patent_id: str = Field(
        default="ID", description="The ID of the provided patent."
    )
    inventors: List[str] = Field(
        default_factory=lambda: ["Inventors"],
        description="The inventors of the provided patent.",
    )
    assignee: str = Field(
        default="Assignee", description="The assignee of the provided patent."
    )
    date: str = Field(
        default="1 Jan 2025",
        description="The publication date of the provided paper in the format 'dd mmm yyyy'.",
        examples=["1 Jan 2025", "23 Sep 1994", "3 Jun 2021"],
    )

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str):
        print("v1", v)
        return v

    @field_serializer("inventors")
    def serialize_inventors(self, inventors: List[str]):
        return ", ".join(inventors)


from app.utils.timing import track_performance

logger = logging.getLogger("performance")


@track_performance
async def _get_pdf_metadata(
    pdf_path: Path,
    pdf_type: Literal["paper", "patent"],
    gemini_api_key: SecretStr,
):
    provider = GoogleProvider(api_key=gemini_api_key.get_secret_value())
    model = GoogleModel("gemini-2.5-flash-lite", provider=provider)
    agent = Agent(
        model,
        output_type=PaperDetails if pdf_type == "paper" else PatentDetails,
    )

    try:
        result = await agent.run(
            [
                "Extract the requested details from the provided document.",
                BinaryContent(
                    data=pdf_path.read_bytes(), media_type="application/pdf"
                ),
            ]
        )
        return result.output
    except Exception as e:
        error_msg = str(e)

        if "503" in error_msg or "UNAVAILABLE" in error_msg:
            _log.error(
                f"❌ Gemini API is overloaded (503 UNAVAILABLE). "
                f"This is a temporary Google service issue. "
                f"Error: {error_msg}"
            )
        elif "429" in error_msg or "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
            _log.error(
                f"❌ Gemini API rate limit exceeded (429). "
                f"Consider upgrading to paid tier or implementing backoff. "
                f"Error: {error_msg}"
            )
        elif "401" in error_msg or "unauthorized" in error_msg.lower():
            _log.error(
                f"❌ Gemini API authentication failed (401). "
                f"Check your API key configuration. "
                f"Error: {error_msg}"
            )
        else:
            _log.error(
                f"❌ Gemini API request failed with unexpected error: {error_msg}"
            )

        raise


@track_performance
async def process_pdf_file(
    pdf_path: str,
    paper_id: str,
    pdf_type: Literal["paper", "patent"],
    gemini_api_key: SecretStr | str,
) -> Dict:
    """
    Process a PDF file to extract text, images, and metadata.

    Args:
        pdf_path:       Path to the PDF file
        paper_id:       Unique identifier for the paper
        pdf_type:       "paper" or "patent"
        gemini_api_key: Gemini API key for metadata extraction

    Returns:
        Dictionary with metadata, extracted images, and text —
        same shape as the docling version.
    """

    if isinstance(gemini_api_key, str):
        gemini_api_key = SecretStr(gemini_api_key)

    extract_dir = Path(f"temp/papers/{paper_id}/source")
    extract_dir.mkdir(parents=True, exist_ok=True)

    # ── Run saral-docling in a thread pool (it is synchronous + CPU-bound) ────
    # parse_pdf() saves image crops to extract_dir/extracted_images/*.png
    # and returns text + image paths in ParseResult.
    loop = asyncio.get_event_loop()

    start_time = time.time()

    result = await loop.run_in_executor(
        None,
        lambda: parse_pdf(ParseConfig(
            pdf_path=str(pdf_path),
            output_dir=str(extract_dir),
            extract_images=True,
        )),
    )

    elapsed = time.time() - start_time
    _log.info(
        f"saral-docling: {result.num_pages} pages parsed in {elapsed:.2f}s — "
        f"{len(result.text)} chars, {len(result.image_paths)} image crops"
    )

    if not result.text.strip():
        _log.warning(
            f"No text layer found in {pdf_path}. "
            f"PDF may be scan-only. Consider pre-processing with ocrmypdf."
        )

    # ── Write text file (mirrors docling behaviour) ───────────────────────────
    text_file = extract_dir / "extracted_text.txt"
    text_file.write_text(result.text, encoding="utf-8")

    # ── Copy original PDF (required by _get_pdf_metadata) ────────────────────
    pdf_copy = extract_dir / "paper.pdf"
    shutil.copy(pdf_path, pdf_copy)

    # ── Fetch metadata via Gemini (unchanged) ─────────────────────────────────
    metadata = (
        await _get_pdf_metadata(pdf_copy, pdf_type, gemini_api_key)
    ).model_dump()

    # ── Return dict — identical shape to the docling version ─────────────────
    return {
        "metadata":       metadata,
        "text_file_path": str(text_file),
        "tex_file_path":  str(text_file),   # kept for backward compat
        "source_dir":     str(extract_dir),
        "image_files":    result.image_paths,   # list[str] of absolute PNG paths
        "pdf_path":       str(pdf_copy),
        "status":         "processed",
    }