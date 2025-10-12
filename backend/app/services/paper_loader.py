from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

import requests

try:
    from pypdf import PdfReader  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    PdfReader = None  # type: ignore

_MAX_SUMMARY_CHARS = 1200


def load_paper_snippet(path: Path) -> Optional[Dict[str, str]]:
    """Return a snippet dictionary for the provided research paper path."""
    if not path.exists():
        raise FileNotFoundError(f"Paper not found: {path}")

    text, detected_title = _extract_text(path)
    if not text:
        return None

    summary = _summarize_text(text)
    if not summary:
        return None

    return {
        "title": _resolve_title(path, detected_title),
        "url": str(path.resolve()),
        "summary": summary,
    }


def load_latex_snippet(path: Path) -> Optional[Dict[str, str]]:
    """Specialised loader for LaTeX sources (alias for load_paper_snippet)."""
    return load_paper_snippet(path)


def load_arxiv_snippet(identifier: str) -> Optional[Dict[str, str]]:
    """Fetch metadata and abstract for an arXiv paper."""
    arxiv_id = _normalise_arxiv_identifier(identifier)
    if not arxiv_id:
        raise ValueError(f"Invalid arXiv identifier: {identifier}")

    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    response = requests.get(url, timeout=10)
    response.raise_for_status()

    root = ET.fromstring(response.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise RuntimeError(f"No arXiv entry found for {arxiv_id}")

    title = entry.findtext("atom:title", default="", namespaces=ns).strip()
    summary = entry.findtext("atom:summary", default="", namespaces=ns).strip()
    link = None
    for link_elem in entry.findall("atom:link", ns):
        if link_elem.get("rel") == "alternate":
            link = link_elem.get("href")
            break
    link = link or f"https://arxiv.org/abs/{arxiv_id}"

    if not summary:
        summary = "Abstract unavailable from arXiv feed."

    return {
        "title": title or arxiv_id,
        "url": link,
        "summary": summary,
    }


def _extract_text(path: Path) -> Tuple[str, Optional[str]]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        if PdfReader is None:
            raise RuntimeError("pypdf is not installed; install it to parse PDF papers.")
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        title = None
        metadata = getattr(reader, "metadata", None)
        if metadata:
            candidate = getattr(metadata, "title", None)
            if not candidate and hasattr(metadata, "get"):
                candidate = metadata.get("/Title")  # type: ignore[attr-defined]
            if isinstance(candidate, str):
                title = candidate.strip() or None
        return "\n".join(pages).strip(), title

    if suffix in {".txt", ".md", ".text"}:
        content = path.read_text(encoding="utf-8", errors="ignore")
        title = _extract_title_from_text(content)
        return content.strip(), title

    if suffix == ".tex":
        content = path.read_text(encoding="utf-8", errors="ignore")
        title = _extract_latex_title(content)
        plain = _latex_to_plain(content)
        return plain, title

    raise ValueError(f"Unsupported paper format: {suffix}")


def _extract_title_from_text(content: str) -> Optional[str]:
    for line in content.splitlines():
        candidate = line.strip().lstrip("# ")
        if candidate:
            return candidate
    return None


def _resolve_title(path: Path, detected_title: Optional[str]) -> str:
    if detected_title:
        return detected_title
    return path.stem.replace("_", " ").strip() or "Research paper"


def _extract_latex_title(content: str) -> Optional[str]:
    match = re.search(r"\\title\{([^}]*)\}", content, flags=re.IGNORECASE | re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()
    return None


def _latex_to_plain(content: str) -> str:
    content = re.sub(r"%.*", "", content)  # strip comments
    content = re.sub(r"\\begin\{[^}]*\}|\\end\{[^}]*\}", " ", content)
    content = re.sub(r"\\cite\{[^}]*\}", " ", content)
    content = re.sub(r"\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^}]*\})?", " ", content)
    content = content.replace("{", " ").replace("}", " ")
    return re.sub(r"\s+", " ", content).strip()


def _normalise_arxiv_identifier(identifier: str) -> Optional[str]:
    identifier = identifier.strip()
    if not identifier:
        return None

    parsed = urlparse(identifier)
    if parsed.scheme in {"http", "https"}:
        path = parsed.path
        if path.startswith("/abs/"):
            return path.split("/abs/")[-1]
        if path.startswith("/pdf/"):
            return path.split("/pdf/")[-1].removesuffix(".pdf")
    return identifier


def _summarize_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary_parts = []
    total_chars = 0
    for sentence in sentences:
        if not sentence:
            continue
        summary_parts.append(sentence.strip())
        total_chars += len(sentence)
        if total_chars >= _MAX_SUMMARY_CHARS:
            break

    summary = " ".join(summary_parts).strip()
    if len(summary) > _MAX_SUMMARY_CHARS:
        summary = summary[:_MAX_SUMMARY_CHARS].rsplit(" ", 1)[0]

    return summary or text[:_MAX_SUMMARY_CHARS]
