"""arXiv paper source downloader."""

import os
import re
import shutil
import tarfile
import gzip
import logging

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def extract_arxiv_id(url: str) -> str:
    """Extract the arXiv ID (e.g. '2301.12345') from an arXiv URL."""
    match = re.search(r"arxiv\.org/(?:abs|pdf)/([0-9]+\.[0-9]+)(?:v[0-9]+)?", url)
    if not match:
        raise ValueError(f"Could not extract arXiv ID from URL: {url}")
    return match.group(1)


def download_source(url: str, download_dir: str) -> str:
    """
    Download and extract the LaTeX source from arXiv.

    Returns:
        Path to the directory containing extracted source files.
    """
    arxiv_id = extract_arxiv_id(url)
    paper_dir = os.path.join(download_dir, arxiv_id.replace(".", "_"))
    os.makedirs(paper_dir, exist_ok=True)

    source_url = f"https://arxiv.org/e-print/{arxiv_id}"
    logger.info(f"Downloading arXiv source: {source_url}")

    resp = requests.get(source_url, stream=True, timeout=60)
    resp.raise_for_status()

    archive_path = os.path.join(paper_dir, f"{arxiv_id}.tar.gz")
    with open(archive_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

    extracted_dir = os.path.join(paper_dir, "source")
    os.makedirs(extracted_dir, exist_ok=True)

    # Try tar.gz first, then plain gzip
    try:
        with tarfile.open(archive_path) as tar:
            for member in tar.getmembers():
                # Skip dangerous paths
                if member.name.startswith("/") or ".." in member.name:
                    continue
                tar.extract(member, path=extracted_dir)
    except tarfile.ReadError:
        try:
            with gzip.open(archive_path, "rb") as f_in:
                out_file = os.path.join(extracted_dir, f"{arxiv_id}.tex")
                with open(out_file, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
        except Exception:
            shutil.copy2(archive_path, os.path.join(extracted_dir, f"{arxiv_id}.raw"))

    return extracted_dir


def get_arxiv_metadata(url: str) -> dict:
    """Scrape title, authors, and date from an arXiv abstract page."""
    metadata = {"title": "Unknown Title", "authors": "Unknown Authors", "date": "Unknown Date"}
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        title_el = soup.find("h1", class_="title mathjax")
        if title_el:
            metadata["title"] = title_el.get_text().replace("Title:", "").strip()

        authors_el = soup.find("div", class_="authors")
        if authors_el:
            metadata["authors"] = authors_el.get_text().replace("Authors:", "").strip()

        date_el = soup.find("div", class_="dateline")
        if date_el:
            metadata["date"] = date_el.get_text().strip()
    except Exception as e:
        logger.warning(f"Could not fetch arXiv metadata: {e}")

    return metadata
