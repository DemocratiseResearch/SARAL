import os
import fitz  # PyMuPDF
import re
import tempfile
import uuid
import shutil
import opendataloader_pdf
import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: str) -> Tuple[Optional[str], Optional[dict]]:
    """
    Extract structured text from PDF using OpenDataLoader PDF

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Tuple of (extracted_text, structured_data)
        - extracted_text: Plain text content suitable for narration
        - structured_data: Full JSON structure with layout information
    """
    try:
        # Create temporary output directory
        with tempfile.TemporaryDirectory() as temp_dir:
            logging.info(f"Extracting content from PDF: {pdf_path}")

            # Convert PDF using OpenDataLoader
            opendataloader_pdf.convert(
                input_path=[pdf_path],
                output_dir=temp_dir,
                format=["json", "markdown"],
                quiet=True,
            )

            # Get the output files
            pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
            json_output_path = os.path.join(temp_dir, f"{pdf_basename}.json")
            markdown_output_path = os.path.join(temp_dir, f"{pdf_basename}.md")

            # Read JSON structure
            structured_data = None
            if os.path.exists(json_output_path):
                with open(json_output_path, "r", encoding="utf-8") as f:
                    structured_data = json.load(f)
                logging.info("Successfully loaded structured JSON data")

            # Read markdown for clean text
            extracted_text = None
            if os.path.exists(markdown_output_path):
                with open(markdown_output_path, "r", encoding="utf-8") as f:
                    extracted_text = f.read()
                logging.info(f"Extracted {len(extracted_text)} characters from PDF")

            if not extracted_text and structured_data:
                # Fallback: extract text from JSON structure
                extracted_text = extract_text_from_json(structured_data)
                logging.info("Extracted text from JSON structure as fallback")

            return extracted_text, structured_data

    except Exception as e:
        logging.error(f"Error extracting text from PDF: {e}", exc_info=True)
        return None, None


def extract_text_from_json(json_data: dict) -> str:
    """
    Recursively extract text content from OpenDataLoader JSON structure

    Args:
        json_data: The JSON structure from OpenDataLoader

    Returns:
        Concatenated text content
    """
    text_parts = []

    def traverse(node):
        if isinstance(node, dict):
            # Check for text content
            if "content" in node:
                text_parts.append(node["content"])

            # Traverse children
            if "kids" in node:
                for child in node["kids"]:
                    traverse(child)

            # Traverse other nested structures
            for key, value in node.items():
                if key not in ["content", "kids"] and isinstance(value, (dict, list)):
                    traverse(value)

        elif isinstance(node, list):
            for item in node:
                traverse(item)

    traverse(json_data)
    return " ".join(text_parts)


def extract_with_full_features(
    pdf_path: str,
    generate_markdown: bool = True,
    generate_html: bool = False,
    generate_annotated_pdf: bool = True,
    output_dir: str = None,  # type: ignore
) -> Dict[str, Any]:
    """
    Extract PDF with all OpenDataLoader features including annotated PDF

    Args:
        pdf_path: Path to the PDF file
        generate_markdown: Generate markdown output
        generate_html: Generate HTML output
        generate_annotated_pdf: Generate annotated PDF with layout highlighting
        output_dir: Custom output directory (if None, creates temp dir)

    Returns:
        Dictionary with extracted content and file paths
    """
    try:
        # Create output directory
        if output_dir is None:
            temp_dir = tempfile.mkdtemp(prefix="saral_pdf_")
            output_dir = temp_dir
        else:
            os.makedirs(output_dir, exist_ok=True)

        logging.info(f"Extracting PDF with full features to: {output_dir}")

        # Prepare formats
        formats = ["json"]
        if generate_markdown:
            formats.append("markdown")
        if generate_html:
            formats.append("html")

        # Extract with OpenDataLoader
        opendataloader_pdf.convert(
            input_path=[pdf_path], output_dir=output_dir, format=formats, quiet=False
        )

        # Generate annotated PDF if requested
        annotated_pdf_path = None
        if generate_annotated_pdf:
            try:
                opendataloader_pdf.run(
                    input_path=pdf_path,
                    output_folder=output_dir,
                    generate_annotated_pdf=True,
                    generate_markdown=False,
                    generate_html=False,
                )

                # Find annotated PDF
                pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
                annotated_pdf_path = os.path.join(
                    output_dir, f"{pdf_basename}_annotated.pdf"
                )

                if not os.path.exists(annotated_pdf_path):
                    # Try alternative naming
                    for f in os.listdir(output_dir):
                        if f.endswith("_annotated.pdf") or f.endswith(".annotated.pdf"):
                            annotated_pdf_path = os.path.join(output_dir, f)
                            break

                if os.path.exists(annotated_pdf_path):
                    logging.info(f"Generated annotated PDF: {annotated_pdf_path}")
                else:
                    logging.warning(
                        "Annotated PDF generation succeeded but file not found"
                    )
                    annotated_pdf_path = None

            except Exception as e:
                logging.warning(f"Could not generate annotated PDF: {e}")
                annotated_pdf_path = None

        # Read outputs
        pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]

        # JSON structure
        json_path = os.path.join(output_dir, f"{pdf_basename}.json")
        structured_data = None
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                structured_data = json.load(f)

        # Markdown text
        md_path = os.path.join(output_dir, f"{pdf_basename}.md")
        markdown = None
        extracted_text = None
        if os.path.exists(md_path):
            with open(md_path, "r", encoding="utf-8") as f:
                markdown = f.read()
                extracted_text = markdown

        # HTML
        html_path = os.path.join(output_dir, f"{pdf_basename}.html")
        html = None
        if os.path.exists(html_path):
            with open(html_path, "r", encoding="utf-8") as f:
                html = f.read()

        # Fallback text extraction
        if not extracted_text and structured_data:
            extracted_text = extract_text_from_json(structured_data)

        return {
            "text": extracted_text,
            "structured_data": structured_data,
            "markdown": markdown,
            "html": html,
            "annotated_pdf_path": annotated_pdf_path,
            "output_dir": output_dir,
            "json_path": json_path,
            "markdown_path": md_path if os.path.exists(md_path) else None,
            "html_path": html_path if os.path.exists(html_path) else None,
        }

    except Exception as e:
        logging.error(f"Error in full feature extraction: {e}", exc_info=True)
        return None  # type: ignore


def summarize_pdf_content(text: str, max_length: int = 2000) -> str:
    """
    Summarize or truncate PDF content to a reasonable length for video narration
    Aims for ~2 minute narration (300-400 words max)

    Args:
        text: Full extracted text
        max_length: Maximum character length (default 2000 for ~2 min video)

    Returns:
        Summarized or truncated text suitable for narration
    """
    # For 2 minute video at 2.5 words/second = 300 words = ~2000 characters
    target_length = min(max_length, 2000)

    # Remove common credit/acknowledgment patterns
    text = text.strip()

    # Split into lines and filter out credit-related content
    lines = text.split("\n")
    filtered_lines = []
    skip_phrases = [
        "thank you",
        "thanks",
        "acknowledgment",
        "acknowledgement",
        "sincerely",
        "regards",
        "best wishes",
        "grateful to",
        "would like to thank",
        "special thanks",
        "credits",
    ]

    for line in lines:
        line_lower = line.lower().strip()
        # Skip lines that are primarily credits/thanks
        if any(phrase in line_lower for phrase in skip_phrases):
            # If line starts with these, likely a credits section
            if line_lower.startswith(tuple(skip_phrases)):
                continue
        filtered_lines.append(line)

    text = "\n".join(filtered_lines).strip()

    if len(text) <= target_length:
        return text

    # Try to truncate at sentence boundary
    truncated = text[:target_length]
    last_period = truncated.rfind(".")
    if last_period > target_length * 0.8:  # If we found a period in the last 20%
        return truncated[: last_period + 1].strip()

    # Try paragraph boundary
    last_newline = truncated.rfind("\n")
    if last_newline > target_length * 0.8:
        return truncated[:last_newline].strip()

    return (truncated + "...").strip()


def process_pdf_file(pdf_path: str, paper_id: str) -> Dict:
    """
    Process a PDF file to extract text, images, and metadata.
    Uses OpenDataLoader for advanced PDF processing.

    Args:
        pdf_path: Path to the PDF file
        paper_id: Unique identifier for the paper

    Returns:
        Dictionary with metadata, extracted images, and text
    """
    # Create directory for extracted content
    extract_dir = f"temp/papers/{paper_id}/source"
    os.makedirs(extract_dir, exist_ok=True)

    # Create directory for images
    image_dir = os.path.join(extract_dir, "images")
    os.makedirs(image_dir, exist_ok=True)

    # Try OpenDataLoader first
    try:
        logging.info(f"Processing PDF with OpenDataLoader: {pdf_path}")
        result = extract_with_full_features(
            pdf_path,
            generate_markdown=True,
            generate_html=False,
            generate_annotated_pdf=True,
            output_dir=extract_dir,
        )

        if result and result.get("text"):
            full_text = result["text"]

            # Extract metadata using PyMuPDF as fallback
            doc = fitz.open(pdf_path)
            metadata = extract_pdf_metadata(doc)

            # Try to extract images using PyMuPDF
            image_files = extract_pdf_images(doc, image_dir)
            doc.close()

            # Create a text file with the extracted content
            text_file_path = os.path.join(extract_dir, "extracted_text.txt")
            with open(text_file_path, "w", encoding="utf-8") as f:
                f.write(full_text)

            # Save a copy of the PDF
            pdf_copy_path = os.path.join(extract_dir, f"paper.pdf")
            shutil.copy(pdf_path, pdf_copy_path)

            return {
                "metadata": metadata,
                "text_file_path": text_file_path,
                "tex_file_path": text_file_path,
                "source_dir": extract_dir,
                "image_files": image_files,
                "pdf_path": pdf_copy_path,
                "structured_data": result.get("structured_data"),
                "markdown": result.get("markdown"),
                "annotated_pdf_path": result.get("annotated_pdf_path"),
                "status": "processed",
            }
    except Exception as e:
        logging.warning(
            f"OpenDataLoader processing failed: {e}. Falling back to PyMuPDF."
        )

    # Fallback to original PyMuPDF method
    doc = fitz.open(pdf_path)

    # Extract metadata
    metadata = extract_pdf_metadata(doc)

    # Extract text
    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n\n"

    # Extract and save images
    image_files = extract_pdf_images(doc, image_dir)

    # Create a text file with the extracted content
    text_file_path = os.path.join(extract_dir, "extracted_text.txt")
    with open(text_file_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    # Save a copy of the PDF
    pdf_copy_path = os.path.join(extract_dir, f"paper.pdf")
    shutil.copy(pdf_path, pdf_copy_path)

    doc.close()

    # Create a structure compatible with the script generator
    return {
        "metadata": metadata,
        "text_file_path": text_file_path,
        "tex_file_path": text_file_path,  # Add this for compatibility with script generator
        "source_dir": extract_dir,
        "image_files": image_files,
        "pdf_path": pdf_copy_path,
        "status": "processed",
    }


def extract_pdf_metadata(doc: fitz.Document) -> Dict:
    """Extract metadata from the PDF document."""
    metadata = {"title": "Research Paper", "authors": "Author", "date": "2024"}

    # Try to get metadata from PDF
    if doc.metadata:
        # Title
        if doc.metadata.get("title"):
            metadata["title"] = doc.metadata.get("title")

        # Authors
        if doc.metadata.get("author"):
            metadata["authors"] = doc.metadata.get("author")

        # Date - try to extract from different fields
        date_fields = ["creationDate", "modDate"]
        for field in date_fields:
            if doc.metadata.get(field):
                date_str = doc.metadata.get(field)
                # Convert from PDF date format if needed (D:YYYYMMDD...)
                if date_str.startswith("D:"):
                    date_str = date_str[2:6]  # Extract just year
                metadata["date"] = date_str
                break

    # Fallback: Try to extract title from first page if metadata doesn't have it
    if metadata["title"] == "Research Paper":
        first_page = doc[0].get_text()
        lines = first_page.split("\n")
        if lines and len(lines) > 0:
            # First non-empty line might be the title
            for line in lines:
                if line.strip():
                    metadata["title"] = line.strip()
                    break

    return metadata


def extract_pdf_images(doc: fitz.Document, output_dir: str) -> List[str]:
    """
    Extract images from PDF and save them to disk.

    Args:
        doc: PyMuPDF document
        output_dir: Directory to save extracted images

    Returns:
        List of paths to saved image files
    """
    image_files = []
    image_count = 0

    for page_index, page in enumerate(doc):
        # Get images
        image_list = page.get_images(full=True)

        for img_index, img in enumerate(image_list):
            xref = img[0]

            # Extract image
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]

            # Get extension
            ext = base_image["ext"]
            if ext.lower() == "jpeg":
                ext = "jpg"

            # Save image
            image_filename = f"image_{page_index+1}_{img_index+1}.{ext}"
            image_path = os.path.join(output_dir, image_filename)

            with open(image_path, "wb") as f:
                f.write(image_bytes)

            image_files.append(image_path)
            image_count += 1

    # If no images found, try alternative extraction method for figures
    if image_count == 0:
        image_files = extract_figures_from_pdf(doc, output_dir)

    return image_files


def extract_figures_from_pdf(doc: fitz.Document, output_dir: str) -> List[str]:
    """
    Alternative method to extract figures as images from the PDF.
    This tries to identify figure regions and extract them as images.

    Args:
        doc: PyMuPDF document
        output_dir: Directory to save extracted figures

    Returns:
        List of paths to saved figure files
    """
    image_files = []

    # Try to find figures based on text patterns
    figure_patterns = [r"Figure \d+", r"Fig\. \d+", r"FIGURE \d+"]

    for page_index, page in enumerate(doc):
        text_blocks = page.get_text("dict")["blocks"]

        for block_index, block in enumerate(text_blocks):
            if "lines" in block:
                for line in block["lines"]:
                    if "spans" in line:
                        for span in line["spans"]:
                            text = span.get("text", "")

                            # Check if this might be a figure caption
                            is_figure_caption = False
                            for pattern in figure_patterns:
                                if re.search(pattern, text):
                                    is_figure_caption = True
                                    break

                            if is_figure_caption:
                                # Try to capture the area above this caption as a figure
                                # This is an approximation - figures are usually above captions
                                caption_rect = fitz.Rect(span["bbox"])
                                figure_rect = fitz.Rect(
                                    caption_rect.x0 - 20,
                                    caption_rect.y0 - 200,  # Look 200 points above
                                    caption_rect.x1 + 20,
                                    caption_rect.y0 - 10,
                                )

                                # Make sure the rect is within page bounds
                                figure_rect.intersect(page.rect)

                                # Only proceed if the rect has sufficient area
                                if figure_rect.width > 100 and figure_rect.height > 100:
                                    # Render this region as an image
                                    pix = page.get_pixmap(
                                        matrix=fitz.Matrix(2, 2), clip=figure_rect
                                    )
                                    image_filename = (
                                        f"figure_{page_index+1}_{block_index+1}.png"
                                    )
                                    image_path = os.path.join(
                                        output_dir, image_filename
                                    )
                                    pix.save(image_path)
                                    image_files.append(image_path)

    return image_files


def extract_text_sections_from_pdf(doc: fitz.Document) -> Dict[str, str]:
    """
    Try to extract structured sections (intro, methods, results, etc.) from PDF.

    Args:
        doc: PyMuPDF document

    Returns:
        Dictionary mapping section names to their text content
    """
    sections = {
        "Introduction": "",
        "Methodology": "",
        "Results": "",
        "Discussion": "",
        "Conclusion": "",
    }

    # Common section heading patterns in academic papers
    section_patterns = {
        "Introduction": [r"introduction", r"1\.?\s+introduction"],
        "Methodology": [
            r"methodology",
            r"methods",
            r"experimental setup",
            r"materials and methods",
        ],
        "Results": [r"results", r"findings", r"experimental results"],
        "Discussion": [r"discussion"],
        "Conclusion": [r"conclusion", r"conclusions", r"summary", r"final remarks"],
    }

    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n\n"

    # Split text into lines
    lines = full_text.split("\n")

    current_section = None
    for i, line in enumerate(lines):
        line_lower = line.strip().lower()

        # Check if this line is a section heading
        for section, patterns in section_patterns.items():
            for pattern in patterns:
                if re.search(pattern, line_lower):
                    current_section = section
                    break
            if current_section:
                break

        # If we're in a section, add text to it
        if current_section and i < len(lines) - 1:
            sections[current_section] += lines[i + 1] + "\n"

    return sections
