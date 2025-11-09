import os
import fitz  # PyMuPDF
import re
import tempfile
import uuid
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

def process_pdf_file(pdf_path: str, paper_id: str) -> Dict:
    """
    Process a PDF file to extract text, images, and metadata.
    
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
    
    # Extract images and text from PDF
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
    
    # Create a structure compatible with the script generator
    return {
        "metadata": metadata,
        "text_file_path": text_file_path,
        "tex_file_path": text_file_path,  # Add this for compatibility with script generator
        "source_dir": extract_dir,
        "image_files": image_files,
        "pdf_path": pdf_copy_path,
        "status": "processed"
    }

def extract_pdf_metadata(doc: fitz.Document) -> Dict:
    """Extract metadata from the PDF document."""
    metadata = {
        "title": "Research Paper",
        "authors": "Author",
        "date": "2024"
    }

    # Try to get metadata from PDF
    if doc.metadata:
        # Title
        if doc.metadata.get("title"):
            metadata["title"] = doc.metadata.get("title")

        # Authors - try metadata first
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

    # Fallback: Try to extract title and authors from first page if metadata doesn't have them
    first_page_text = doc[0].get_text()

    # Title fallback
    if metadata["title"] == "Research Paper":
        metadata["title"] = _extract_title_from_text(first_page_text)

    # Authors fallback - if not found in metadata
    # Also try text extraction if metadata only has single author
    # (some PDFs have incomplete metadata)
    if metadata["authors"] == "Author":
        metadata["authors"] = _extract_authors_from_text(first_page_text)
    else:
        # Even if we have an author from metadata, try text extraction
        # If text gives us multiple authors, prefer that (more complete)
        text_authors = _extract_authors_from_text(first_page_text)
        if text_authors and text_authors != "Author":
            # Count authors in each version
            metadata_author_count = len(metadata["authors"].split(","))
            text_author_count = len(text_authors.split(","))
            # If text has more authors, use it (likely more complete)
            if text_author_count > metadata_author_count:
                metadata["authors"] = text_authors

    return metadata


def _extract_authors_from_text(text: str) -> str:
    """
    Extract author names from PDF text.

    Supports patterns like:
    - "Authors: Name1, Name2, Name3"
    - "Authors: Name1 and Name2"
    - Multi-line author lists (authors spanning multiple lines)
    - "Name1, Name2, and Name3"

    Also handles:
    - Superscript numbers (1, 2, 3, etc.) and markers (1†, 2‡, etc.)
    - Special symbols (†, ‡, *, ¶, §, ¤, etc.)
    - Affiliation markers in parentheses (e.g., "John Smith (MIT)")
    - Newlines within author list

    Args:
        text: Text extracted from PDF

    Returns:
        Comma-separated author names or default "Author"
    """
    if not text:
        return "Author"

    # Pattern 1: Look for "Authors:" line (most common in academic papers)
    # Matches across multiple lines until it hits a section header like "Affiliations:" or "Abstract:"
    authors_pattern = r"Authors?:\s*(.+?)(?=\n[A-Z][a-z]+:|$)"
    match = re.search(authors_pattern, text, re.IGNORECASE | re.DOTALL)

    if match:
        authors_text = match.group(1)
    else:
        # Pattern 2: If no explicit "Authors:" label, try first page
        # that contain multiple person names
        lines = text.split('\n')[:15]  # Look in first 15 lines
        authors_text = None

        # Skip obvious header/metadata lines 
        # (first few lines often have journal info)
        for line in lines[1:]:  # Skip the very first line (often header)
            stripped = line.strip()

            if not stripped or len(stripped) > 300:
                continue

            # Look for lines with "First Last and First Last" pattern
            # Must have at least 2 capitalized words AND either "and" or comma
            capitalized_words = re.findall(r'\b[A-Z][a-z]+\b', stripped)
            has_separator = bool(re.search(r'\band\b|\,', stripped, re.IGNORECASE))

            # Check if it looks like an author line:
            # - At least 3 capitalized words (minimum for "First Last")
            # - Contains "and" or comma separator
            # - Doesn't look like a sentence (no common words like "the", "is", etc.)
            common_words = ['the', 'is', 'are', 'was', 'were', 'this', 'that']
            has_common_words = any(re.search(rf'\b{w}\b', stripped.lower()) for w in common_words)

            if len(capitalized_words) >= 2 and has_separator and not has_common_words:
                authors_text = stripped
                break

        if not authors_text:
            return "Author"

    # Clean up the extracted authors text
    authors = _clean_author_names(authors_text)

    return authors if authors else "Author"


def _clean_author_names(authors_text: str) -> str:
    """
    Clean up author names by removing superscripts, symbols, and affiliations.

    Args:
        authors_text: Raw author string from PDF

    Returns:
        Cleaned comma-separated author names
    """
    # Remove superscript numbers and special symbols (†, ‡, *, etc.)
    # Keep: letters, spaces, commas, "and"
    authors_text = re.sub(r'[0-9†‡*¶§¤†‡†‡]', '', authors_text)

    # Remove parenthetical content (affiliations)
    authors_text = re.sub(r'\([^)]*\)', '', authors_text)

    # Split by common delimiters
    # Handle both comma and "and" separators
    authors_text = re.sub(r'\s+and\s+', ', ', authors_text, flags=re.IGNORECASE)

    # Split by comma
    author_names = [name.strip() for name in authors_text.split(',')]

    # Clean each author name
    cleaned_authors = []
    for author in author_names:
        # Remove extra whitespace
        author = ' '.join(author.split())

        # Skip empty or too short names
        if author and len(author) > 2:
            cleaned_authors.append(author)

    if cleaned_authors:
        # Return up to 50 authors 
        return ', '.join(cleaned_authors[:50])

    return ""


def _extract_title_from_text(text: str) -> str:
    """
    Extract title from PDF first page text.

    Args:
        text: Text extracted from first page

    Returns:
        Extracted title or default "Research Paper"
    """
    if not text:
        return "Research Paper"

    lines = text.split('\n')

    # Skip very short lines and lines that look like page numbers
    for line in lines:
        stripped = line.strip()

        # Skip if empty or too short
        if not stripped or len(stripped) < 10:
            continue

        # Skip if looks like page number or metadata
        if stripped.isdigit() or stripped.lower() in ['abstract', 'authors', 'affiliations']:
            continue

        # Skip if too long 
        if len(stripped) > 300:
            continue

        # Found likely title
        return stripped

    return "Research Paper"

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
                                    caption_rect.y0 - 10
                                )
                                
                                # Make sure the rect is within page bounds
                                figure_rect.intersect(page.rect)
                                
                                # Only proceed if the rect has sufficient area
                                if figure_rect.width > 100 and figure_rect.height > 100:
                                    # Render this region as an image
                                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=figure_rect)
                                    image_filename = f"figure_{page_index+1}_{block_index+1}.png"
                                    image_path = os.path.join(output_dir, image_filename)
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
        "Conclusion": ""
    }
    
    # Common section heading patterns in academic papers
    section_patterns = {
        "Introduction": [r"introduction", r"1\.?\s+introduction"],
        "Methodology": [r"methodology", r"methods", r"experimental setup", r"materials and methods"],
        "Results": [r"results", r"findings", r"experimental results"],
        "Discussion": [r"discussion"],
        "Conclusion": [r"conclusion", r"conclusions", r"summary", r"final remarks"]
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
            sections[current_section] += lines[i+1] + "\n"
    
    return sections 
