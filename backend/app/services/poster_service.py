"""
Poster Generation Service
Simplified implementation inspired by Paper2Poster
Generates academic posters from research papers
"""

import os
import logging
import json
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
import uuid

from google import genai
from google.genai.types import GenerateContentConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PosterService:
    """Service for generating academic posters from research papers"""

    def __init__(self, gemini_api_key: str):
        self.gemini_api_key = gemini_api_key
        self.client = genai.Client(api_key=gemini_api_key)
        self.posters_dir = Path("temp/posters")
        self.posters_dir.mkdir(parents=True, exist_ok=True)

    def _extract_text_from_response(self, response) -> str:
        """Extract text from Gemini API response."""
        try:
            # Modern Gemini API provides .text directly
            if hasattr(response, "text") and response.text:
                return response.text

            # Fallback for other response formats
            candidates = getattr(response, "candidates", None)
            if candidates:
                first = candidates[0]
                content = getattr(first, "content", None)
                if content:
                    parts = getattr(content, "parts", None)
                    if parts:
                        return "".join(
                            [
                                getattr(p, "text", "")
                                for p in parts
                                if getattr(p, "text", None)
                            ]
                        )
                    return getattr(content, "text", "") or ""

        except Exception:
            logger.exception("Error extracting text from genai response")
            return ""

        return ""

    def extract_paper_content(self, pdf_path: str) -> Dict[str, Any]:
        """
        Extract structured content from PDF using pdf_processor

        Args:
            pdf_path: Path to the PDF file

        Returns:
            Dictionary with extracted content including text, sections, figures, tables
        """
        try:
            from .pdf_processor import extract_with_full_features
            from .saras_service import SarasService

            logger.info(f"📄 Extracting content from {pdf_path}")

            # Create unique output directory for this paper
            paper_id = Path(pdf_path).stem
            output_dir = self.posters_dir / f"{paper_id}_extraction"
            output_dir.mkdir(parents=True, exist_ok=True)

            # Extract with full features
            extraction_result = extract_with_full_features(
                str(pdf_path),
                generate_markdown=True,
                generate_html=False,
                generate_annotated_pdf=False,
                output_dir=str(output_dir),
            )

            if not extraction_result:
                raise ValueError("Failed to extract content from PDF")

            # Get structured data
            structured_data = extraction_result.get("structured_data", {})
            text_content = extraction_result.get("text", "")
            markdown_content = extraction_result.get("markdown", "")

            # Use SarasService's _extract_elements method for better extraction
            saras = SarasService(self.gemini_api_key)
            elements = saras._extract_elements(structured_data)

            # Parse content into sections with better content
            sections = self._parse_sections_enhanced(
                markdown_content or text_content, elements
            )

            # Extract figures and tables information with actual paths
            figures = self._extract_figures_with_images(
                structured_data, output_dir, pdf_path
            )
            tables = elements.get("tables", [])

            # Get title and authors from metadata or first section
            title = "Research Poster"
            authors = ""

            if sections and len(sections) > 0:
                # Try to get title from first section if it looks like a title
                first_section = sections[0]
                if len(first_section.get("title", "")) < 100 and not first_section.get(
                    "title", ""
                ).lower().startswith(("abstract", "introduction", "1", "i.")):
                    title = first_section["title"]
                    # Look for authors in the content of the first section
                    content_lines = first_section["content"].split("\n")[:5]
                    for line in content_lines:
                        if line.strip() and not line.strip().startswith(
                            ("http", "www", "arxiv")
                        ):
                            if any(
                                indicator in line.lower()
                                for indicator in ["university", "department", "@", ","]
                            ):
                                authors = line.strip()
                                break

            return {
                "text": text_content,
                "markdown": markdown_content,
                "sections": sections,
                "figures": figures,
                "tables": tables,
                "elements": elements,
                "metadata": extraction_result.get("metadata", {}),
                "output_dir": str(output_dir),
                "title": title,
                "authors": authors,
            }

        except Exception as e:
            logger.error(f"❌ Error extracting paper content: {e}", exc_info=True)
            raise

    def _parse_sections(self, content: str) -> List[Dict[str, str]]:
        """Parse markdown/text content into sections"""
        sections = []
        lines = content.split("\n")
        current_section = {"title": "Introduction", "content": ""}

        for line in lines:
            # Check for section headers (# Header or numbered sections)
            if line.startswith("#") or (
                line.strip() and line.strip()[0].isdigit() and "." in line[:10]
            ):
                # Save previous section
                if current_section["content"].strip():
                    sections.append(current_section)

                # Start new section
                title = line.lstrip("#").strip()
                # Remove leading numbers like "1. Introduction"
                title = title.split(".", 1)[-1].strip() if "." in title[:10] else title
                current_section = {"title": title, "content": ""}
            else:
                current_section["content"] += line + "\n"

        # Add last section
        if current_section["content"].strip():
            sections.append(current_section)

        return sections

    def _parse_sections_enhanced(
        self, content: str, elements: Dict[str, List]
    ) -> List[Dict[str, str]]:
        """Parse markdown/text content into sections with enhanced logic"""
        sections = []
        lines = content.split("\n")
        current_section = None

        # Get section headings from elements if available
        section_headings = [
            elem.get("content", "").strip() for elem in elements.get("sections", [])
        ]

        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                if current_section:
                    current_section["content"] += "\n"
                continue

            # Check if this line is a section header
            is_header = False

            # Method 1: Markdown headers
            if line.startswith("#"):
                is_header = True
                title = line.lstrip("#").strip()

            # Method 2: Numbered sections (1. Introduction, 2. Methods, etc.)
            elif line_stripped and len(line_stripped) > 0:
                # Check for patterns like "1. Introduction" or "I. Introduction"
                if line_stripped[0].isdigit() or line_stripped[0] in ["I", "V", "X"]:
                    if (
                        "." in line_stripped[:15]
                    ):  # Section number should be early in line
                        parts = line_stripped.split(".", 1)
                        if len(parts) == 2 and parts[1].strip():
                            # Check if this looks like a section (not just a sentence)
                            potential_title = parts[1].strip()
                            if (
                                len(potential_title) < 100
                                and not potential_title[0].islower()
                            ):
                                is_header = True
                                title = potential_title

            # Method 3: Check against extracted section headings
            if not is_header and line_stripped in section_headings:
                is_header = True
                title = line_stripped

            # Method 4: All caps lines that are short (likely section headers)
            if (
                not is_header
                and line_stripped.isupper()
                and 5 < len(line_stripped) < 50
            ):
                is_header = True
                title = line_stripped.title()  # Convert to title case

            if is_header:
                # Save previous section
                if current_section and current_section["content"].strip():
                    sections.append(current_section)

                # Start new section
                current_section = {"title": title, "content": ""}
            else:
                # Add to current section content
                if current_section is None:
                    # No section yet, create a default one
                    current_section = {"title": "Introduction", "content": ""}
                current_section["content"] += line + "\n"

        # Add last section
        if current_section and current_section["content"].strip():
            sections.append(current_section)

        # Filter out very short sections (likely not real sections)
        sections = [s for s in sections if len(s["content"].strip()) > 50]

        return sections

    def _convert_pdf_pages_to_images(
        self, pdf_path: str, output_dir: Path, max_pages: int = 5
    ) -> List[str]:
        """Convert PDF pages to images as fallback for figures"""
        try:
            import fitz  # PyMuPDF

            images_dir = output_dir / "pdf_pages"
            images_dir.mkdir(parents=True, exist_ok=True)

            doc = fitz.open(pdf_path)
            image_paths = []

            # Convert first few pages to images (for potential figures)
            for page_num in range(min(max_pages, len(doc))):
                page = doc[page_num]
                # Render page at 2x resolution for better quality
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)

                image_path = images_dir / f"page_{page_num + 1}.png"
                pix.save(str(image_path))
                image_paths.append(str(image_path))

                logger.info(f"Converted PDF page {page_num + 1} to image")

            doc.close()
            return image_paths

        except ImportError:
            logger.warning("PyMuPDF not installed, cannot convert PDF pages to images")
            return []
        except Exception as e:
            logger.error(f"Error converting PDF pages to images: {e}")
            return []

    def _extract_figures_with_images(
        self, structured_data: Dict, output_dir: Path, pdf_path: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Extract information about figures from structured data with actual image paths"""
        figures = []

        # Look for image files in the output directory
        image_files = []
        if output_dir.exists():
            for ext in ["*.png", "*.jpg", "*.jpeg"]:
                image_files.extend(list(output_dir.glob(ext)))

        def traverse(obj, depth=0):
            if isinstance(obj, dict):
                elem_type = obj.get("type", "")
                if "figure" in elem_type.lower() or "image" in elem_type.lower():
                    figure_data = {
                        "type": elem_type,
                        "caption": obj.get("text", ""),
                        "bbox": obj.get("bbox"),
                        "image_path": None,
                    }

                    # Try to match with actual image file
                    if image_files and len(figures) < len(image_files):
                        figure_data["image_path"] = str(image_files[len(figures)])

                    figures.append(figure_data)
                for value in obj.values():
                    traverse(value, depth + 1)
            elif isinstance(obj, list):
                for item in obj:
                    traverse(item, depth)

        if structured_data:
            traverse(structured_data)

        # If no figures found through structured data but we have images, add them
        if not figures and image_files:
            for i, img_path in enumerate(image_files):
                figures.append(
                    {
                        "type": "image",
                        "caption": f"Figure {i+1}",
                        "bbox": None,
                        "image_path": str(img_path),
                    }
                )

        # If still no figures, try converting PDF pages as fallback
        if not figures and pdf_path:
            logger.info(
                "No figures extracted, converting PDF pages to images as fallback"
            )
            pdf_images = self._convert_pdf_pages_to_images(
                pdf_path, output_dir, max_pages=3
            )
            for i, img_path in enumerate(pdf_images):
                figures.append(
                    {
                        "type": "pdf_page",
                        "caption": f"Research Overview (Page {i+1})",
                        "bbox": None,
                        "image_path": img_path,
                    }
                )

        # ALWAYS ensure we have at least ONE figure by converting first PDF page
        if not figures and pdf_path:
            logger.warning("⚠️ Still no figures! Force converting first PDF page...")
            pdf_images = self._convert_pdf_pages_to_images(
                pdf_path, output_dir, max_pages=1
            )
            if pdf_images:
                figures.append(
                    {
                        "type": "pdf_page",
                        "caption": "Research Paper Overview",
                        "bbox": None,
                        "image_path": pdf_images[0],
                    }
                )
                logger.info(f"✅ Added fallback figure: {pdf_images[0]}")

        logger.info(f"📊 Total figures extracted: {len(figures)}")
        for i, fig in enumerate(figures):
            logger.info(
                f"  Figure {i}: type={fig.get('type')}, path={fig.get('image_path')}"
            )

        return figures

    def _extract_tables_info(self, structured_data: Dict) -> List[Dict[str, Any]]:
        """Extract information about tables from structured data"""
        tables = []

        def traverse(obj, depth=0):
            if isinstance(obj, dict):
                elem_type = obj.get("type", "")
                if "table" in elem_type.lower():
                    tables.append(
                        {
                            "type": elem_type,
                            "caption": obj.get("text", ""),
                            "bbox": obj.get("bbox"),
                        }
                    )
                for value in obj.values():
                    traverse(value, depth + 1)
            elif isinstance(obj, list):
                for item in obj:
                    traverse(item, depth)

        if structured_data:
            traverse(structured_data)

        return tables

    def generate_poster_outline(
        self, paper_content: Dict[str, Any], poster_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate poster outline and structure using LLM

        Args:
            paper_content: Extracted paper content
            poster_config: Configuration for poster (dimensions, style, etc.)

        Returns:
            Poster outline with sections and layout
        """
        try:
            logger.info("🎨 Generating poster outline with Gemini...")

            # Prepare prompt for poster outline generation
            prompt = self._create_outline_prompt(paper_content, poster_config)

            # Call Gemini API
            response = self.client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=prompt,
                config=GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=4096,
                ),
            )

            outline_text = self._extract_text_from_response(response)
            logger.info(
                f"Generated outline text (first 500 chars): {outline_text[:500]}..."
            )

            # Parse JSON response
            try:
                outline = json.loads(outline_text)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown code blocks
                if "```json" in outline_text:
                    json_start = outline_text.find("```json") + 7
                    json_end = outline_text.find("```", json_start)
                    outline_text = outline_text[json_start:json_end].strip()
                    outline = json.loads(outline_text)
                else:
                    raise ValueError("Could not parse outline as JSON")

            logger.info(
                f"✅ Successfully generated poster outline with {len(outline.get('sections', []))} sections"
            )
            return outline

        except Exception as e:
            logger.error(f"❌ Error generating poster outline: {e}", exc_info=True)
            raise

    def _create_outline_prompt(
        self, paper_content: Dict[str, Any], poster_config: Dict[str, Any]
    ) -> str:
        """Create prompt for poster outline generation"""

        # Get title and authors from extracted content
        title = paper_content.get("title", "Research Poster")
        authors = paper_content.get("authors", "")

        # Get section summaries
        sections_text = ""
        for i, s in enumerate(paper_content.get("sections", [])[:8], 1):
            # Limit content preview to 300 chars per section
            content_preview = s["content"][:300].strip()
            if len(s["content"]) > 300:
                content_preview += "..."
            sections_text += f"\n## {i}. {s['title']}\n{content_preview}\n"

        figures_count = len(paper_content.get("figures", []))
        tables_count = len(paper_content.get("tables", []))

        prompt = f"""You are an expert academic poster designer. Create a structured outline for a research poster based on the following paper content.

**Paper Title:** {title}
**Authors:** {authors if authors else "Not specified"}

**Paper Content (Sections):**
{sections_text}

**Available Elements:**
- Figures: {figures_count}
- Tables: {tables_count}

**Poster Configuration:**
- Dimensions: {poster_config.get('width', 48)} x {poster_config.get('height', 36)} inches
- Style: {poster_config.get('style', 'academic')}

**Instructions:**
1. Use the ACTUAL paper title and authors provided above
2. Create a visually balanced poster layout with 4-6 main sections
3. Prioritize: Introduction/Background, Key Methods, Main Results, Conclusions
4. Suggest which figures/tables to include (if any) - use actual figure indices (0 to {figures_count-1})
5. Keep text concise and scannable (bullet points preferred)
6. Each section should have 2-4 key bullet points
7. Distribute sections across a 3-column grid layout

**Output Format (JSON):**
```json
{{
  "title": "{title}",
  "authors": "{authors if authors else 'Research Team'}",
  "sections": [
    {{
      "name": "Background",
      "position": {{"row": 1, "col": 1, "width": 1, "height": 1}},
      "content_type": "text",
      "key_points": ["Point 1", "Point 2", "Point 3"],
      "max_words": 120
    }},
    {{
      "name": "Key Results",
      "position": {{"row": 2, "col": 1, "width": 2, "height": 1}},
      "content_type": "figure",
      "figure_index": 0,
      "caption": "Main result visualization"
    }}
  ],
  "color_scheme": {{"primary": "#1a5490", "secondary": "#f0f0f0", "accent": "#d4af37"}}
}}
```

Generate the poster outline now:"""

        return prompt

    def generate_poster_content(
        self, paper_content: Dict[str, Any], outline: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate detailed content for each poster section

        Args:
            paper_content: Extracted paper content
            outline: Poster outline structure

        Returns:
            Detailed content for each section
        """
        try:
            logger.info("✍️ Generating poster content...")

            poster_content = {
                "title": outline.get("title", "Research Poster"),
                "authors": outline.get("authors", ""),
                "sections": [],
            }

            # Generate content for each section
            for section in outline.get("sections", []):
                logger.info(
                    f"Generating content for section: {section.get('name', 'Unknown')}"
                )
                section_content = self._generate_section_content(section, paper_content)
                logger.info(
                    f"Section content generated: {len(section_content.get('bullet_points', []))} bullet points"
                )
                poster_content["sections"].append(section_content)

            logger.info("✅ Successfully generated poster content")
            return poster_content

        except Exception as e:
            logger.error(f"❌ Error generating poster content: {e}", exc_info=True)
            raise

    def _generate_section_content(
        self, section_outline: Dict[str, Any], paper_content: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate content for a specific section"""
        try:
            section_name = section_outline.get("name", "")
            content_type = section_outline.get("content_type", "text")
            max_words = section_outline.get("max_words", 150)

            # Find relevant content from paper with better matching
            relevant_content = ""
            section_title_lower = section_name.lower()

            # Try exact or partial match
            for paper_section in paper_content.get("sections", []):
                paper_title_lower = paper_section["title"].lower()

                # Check for matches
                if (
                    section_title_lower in paper_title_lower
                    or paper_title_lower in section_title_lower
                    or any(
                        keyword in paper_title_lower
                        for keyword in section_title_lower.split()
                    )
                ):
                    relevant_content = paper_section["content"]
                    logger.info(
                        f"Matched section '{section_name}' with paper section '{paper_section['title']}'"
                    )
                    break

            # Fallback strategies if no match found
            if not relevant_content:
                # Try by keywords
                keywords_map = {
                    "introduction": ["introduction", "background", "abstract"],
                    "background": ["background", "introduction", "related work"],
                    "method": ["method", "approach", "technique", "algorithm"],
                    "result": ["result", "finding", "experiment", "evaluation"],
                    "conclusion": ["conclusion", "discussion", "future work"],
                }

                for keyword_group in keywords_map.get(
                    section_title_lower.split()[0], []
                ):
                    for paper_section in paper_content.get("sections", []):
                        if keyword_group in paper_section["title"].lower():
                            relevant_content = paper_section["content"]
                            logger.info(
                                f"Keyword matched section '{section_name}' with '{paper_section['title']}'"
                            )
                            break
                    if relevant_content:
                        break

            # Final fallback - use full text
            if not relevant_content:
                logger.warning(
                    f"No specific match for section '{section_name}', using general content"
                )
                # Use the full text but limit it
                relevant_content = paper_content.get("text", "")[:3000]

            if content_type == "text":
                # Generate concise bullet points with better prompt
                prompt = f"""You are creating content for a research poster section titled "{section_name}".

Source content from the paper:
{relevant_content[:2500]}

Task: Create {max_words} words or less of concise, impactful bullet points (3-5 points) that:
1. Capture the key insights from this content
2. Are written for a scientific poster (clear, direct, scannable)
3. Use strong action verbs and specific details
4. Avoid unnecessary jargon

Output ONLY as valid JSON (no markdown formatting):
{{
  "bullet_points": ["Specific, actionable point 1", "Clear finding 2", "Important insight 3"]
}}"""

                try:
                    response = self.client.models.generate_content(
                        model="gemini-2.0-flash-exp",
                        contents=prompt,
                        config=GenerateContentConfig(
                            temperature=0.5,
                            max_output_tokens=1024,
                        ),
                    )

                    content_text = self._extract_text_from_response(response)
                    logger.info(
                        f"Generated content for {section_name}: {content_text[:200]}..."
                    )

                    # Clean up the response to extract JSON
                    try:
                        # Remove markdown code blocks if present
                        if "```json" in content_text:
                            content_text = (
                                content_text.split("```json")[1].split("```")[0].strip()
                            )
                        elif "```" in content_text:
                            content_text = (
                                content_text.split("```")[1].split("```")[0].strip()
                            )

                        content_data = json.loads(content_text)
                        bullet_points = content_data.get("bullet_points", [])

                        # Ensure we have actual content
                        if not bullet_points or all(
                            not bp.strip() for bp in bullet_points
                        ):
                            raise ValueError("Empty bullet points")

                    except Exception as e:
                        logger.warning(
                            f"JSON parsing failed for section {section_name}: {e}"
                        )
                        # Fallback: try to extract bullet-like lines from the response
                        lines = content_text.split("\n")
                        bullet_points = []
                        for line in lines:
                            line = line.strip()
                            if line and len(line) > 10:
                                # Remove common bullet markers
                                line = line.lstrip("•-*\"'[]{}").strip()
                                if line and not line.startswith(
                                    ("{", "}", "[", "]", '"', "bullet_points")
                                ):
                                    bullet_points.append(line)

                        # If still no bullets, create from relevant content
                        if not bullet_points:
                            # Extract first few sentences
                            sentences = relevant_content.split(".")[:5]
                            bullet_points = [
                                s.strip() + "."
                                for s in sentences
                                if len(s.strip()) > 20
                            ]

                except Exception as api_error:
                    logger.error(
                        f"API call failed for section {section_name}: {api_error}"
                    )
                    # Fallback to extracting from relevant content
                    sentences = relevant_content.split(".")[:5]
                    bullet_points = [
                        s.strip() + "." for s in sentences if len(s.strip()) > 20
                    ]

                    if not bullet_points:
                        bullet_points = [
                            f"Content from {section_name} section of the paper"
                        ]

                return {
                    "name": section_name,
                    "position": section_outline.get("position", {}),
                    "content_type": "text",
                    "bullet_points": bullet_points[:5],  # Max 5 bullets
                }

            elif content_type == "figure":
                figure_index = section_outline.get("figure_index", 0)
                figures = paper_content.get("figures", [])

                # Get the actual figure if available
                figure_data = None
                if figures and figure_index < len(figures):
                    figure_data = figures[figure_index]

                # If no figure at that index, try to get ANY figure
                if not figure_data or not figure_data.get("image_path"):
                    for fig in figures:
                        if fig.get("image_path"):
                            figure_data = fig
                            logger.info(
                                f"Using alternative figure for section {section_name}"
                            )
                            break

                # Last resort: if still no figure, log error but return what we have
                if not figure_data or not figure_data.get("image_path"):
                    logger.error(
                        f"No figures available for section {section_name}! Total figures: {len(figures)}"
                    )
                    logger.error(f"Figure data: {figures}")

                return {
                    "name": section_name,
                    "position": section_outline.get("position", {}),
                    "content_type": "figure",
                    "figure_index": figure_index,
                    "caption": (
                        figure_data.get("caption", section_outline.get("caption", ""))
                        if figure_data
                        else section_outline.get("caption", "Research visualization")
                    ),
                    "image_path": (
                        figure_data.get("image_path") if figure_data else None
                    ),
                }

            return {
                "name": section_name,
                "position": section_outline.get("position", {}),
                "content_type": "text",
                "bullet_points": ["Content not available"],
            }

        except Exception as e:
            logger.error(
                f"Error generating section content for {section_outline.get('name', 'unknown')}: {e}"
            )
            return {
                "name": section_outline.get("name", ""),
                "position": section_outline.get("position", {}),
                "content_type": "text",
                "bullet_points": ["Error generating content"],
            }

    def create_poster_html(
        self,
        poster_content: Dict[str, Any],
        outline: Dict[str, Any],
        config: Dict[str, Any],
    ) -> str:
        """
        Create HTML representation of the poster

        Args:
            poster_content: Generated content
            outline: Poster outline
            config: Poster configuration

        Returns:
            HTML string
        """
        try:
            logger.info("🖼️ Creating poster HTML...")

            width = config.get("width", 48)
            height = config.get("height", 36)
            color_scheme = outline.get(
                "color_scheme",
                {"primary": "#1a5490", "secondary": "#f0f0f0", "accent": "#d4af37"},
            )

            # Build HTML
            html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{poster_content.get('title', 'Research Poster')}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Arial', 'Helvetica', sans-serif;
            background: white;
        }}
        .poster {{
            width: {width}in;
            height: {height}in;
            background: {color_scheme.get('secondary', '#f0f0f0')};
            padding: 0.5in;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: auto;
            gap: 0.3in;
        }}
        .header {{
            grid-column: 1 / -1;
            background: {color_scheme.get('primary', '#1a5490')};
            color: white;
            padding: 0.4in;
            text-align: center;
            border-radius: 10px;
        }}
        .header h1 {{
            font-size: 72pt;
            margin-bottom: 0.2in;
            font-weight: bold;
        }}
        .header p {{
            font-size: 36pt;
            opacity: 0.95;
        }}
        .section {{
            background: white;
            padding: 0.3in;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .section h2 {{
            color: {color_scheme.get('primary', '#1a5490')};
            font-size: 42pt;
            margin-bottom: 0.15in;
            border-bottom: 3px solid {color_scheme.get('accent', '#d4af37')};
            padding-bottom: 0.1in;
        }}
        .section ul {{
            font-size: 28pt;
            line-height: 1.6;
            padding-left: 0.3in;
        }}
        .section li {{
            margin-bottom: 0.15in;
        }}
        .figure {{
            background: white;
            padding: 0.2in;
            text-align: center;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .figure img {{
            max-width: 100%;
            max-height: 90%;
            border-radius: 4px;
        }}
        .figure-caption {{
            font-size: 24pt;
            color: #666;
            margin-top: 0.1in;
            font-style: italic;
        }}
    </style>
</head>
<body>
    <div class="poster">
        <div class="header">
            <h1>{poster_content.get('title', 'Research Poster')}</h1>
            <p>{poster_content.get('authors', '')}</p>
        </div>
"""

            # Add sections
            for section in poster_content.get("sections", []):
                position = section.get("position", {})
                col_span = position.get("width", 1)
                row_span = position.get("height", 1)

                style = f"grid-column: span {col_span}; grid-row: span {row_span};"

                if section.get("content_type") == "text":
                    bullet_points = section.get("bullet_points", [])
                    bullets_html = "\n".join(
                        [f"<li>{point}</li>" for point in bullet_points]
                    )

                    html += f"""
        <div class="section" style="{style}">
            <h2>{section.get('name', '')}</h2>
            <ul>
                {bullets_html}
            </ul>
        </div>
"""
                elif section.get("content_type") == "figure":
                    image_path = section.get("image_path")

                    # If we have an actual image path, embed it
                    if image_path and Path(image_path).exists():
                        import base64

                        try:
                            # Read and encode the image
                            with open(image_path, "rb") as img_file:
                                img_data = base64.b64encode(img_file.read()).decode(
                                    "utf-8"
                                )

                            # Determine image type
                            img_ext = Path(image_path).suffix.lower()
                            mime_type = (
                                "image/jpeg"
                                if img_ext in [".jpg", ".jpeg"]
                                else "image/png"
                            )

                            image_html = f'<img src="data:{mime_type};base64,{img_data}" alt="{section.get("name", "Figure")}" />'
                        except Exception as e:
                            logger.warning(f"Failed to embed image {image_path}: {e}")
                            image_html = '<p style="font-size: 32pt; color: #999;">[Image Loading Failed]</p>'
                    else:
                        image_html = '<p style="font-size: 32pt; color: #999;">[Figure Placeholder]</p>'

                    html += f"""
        <div class="figure" style="{style}">
            <h2>{section.get('name', '')}</h2>
            <div style="background: #f8f8f8; padding: 0.2in; border-radius: 8px; min-height: 4in; display: flex; align-items: center; justify-content: center;">
                {image_html}
            </div>
            <p class="figure-caption">{section.get('caption', '')}</p>
        </div>
"""

            html += """
    </div>
</body>
</html>"""

            logger.info("✅ Successfully created poster HTML")
            return html

        except Exception as e:
            logger.error(f"❌ Error creating poster HTML: {e}", exc_info=True)
            raise

    async def generate_poster(
        self, pdf_path: str, config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Main method to generate a poster from a PDF

        Args:
            pdf_path: Path to the research paper PDF
            config: Optional poster configuration

        Returns:
            Dictionary with poster information and file paths
        """
        try:
            # Default configuration
            if config is None:
                config = {
                    "width": 48,  # inches
                    "height": 36,  # inches
                    "style": "academic",
                }

            poster_id = str(uuid.uuid4())
            poster_dir = self.posters_dir / poster_id
            poster_dir.mkdir(parents=True, exist_ok=True)

            logger.info(f"🎯 Starting poster generation for: {pdf_path}")

            # Step 1: Extract paper content
            paper_content = self.extract_paper_content(pdf_path)

            # Step 2: Generate poster outline
            outline = self.generate_poster_outline(paper_content, config)

            # Step 3: Generate detailed content
            poster_content = self.generate_poster_content(paper_content, outline)

            # Step 4: Create HTML poster
            html_content = self.create_poster_html(poster_content, outline, config)

            # Save HTML file
            html_path = poster_dir / "poster.html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            # Save metadata
            metadata = {
                "poster_id": poster_id,
                "created_at": datetime.now().isoformat(),
                "pdf_path": str(pdf_path),
                "config": config,
                "outline": outline,
                "status": "completed",
            }

            metadata_path = poster_dir / "metadata.json"
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)

            logger.info(f"✅ Poster generation completed: {poster_id}")

            return {
                "poster_id": poster_id,
                "html_path": str(html_path),
                "poster_dir": str(poster_dir),
                "metadata": metadata,
                "status": "completed",
            }

        except Exception as e:
            logger.error(f"❌ Error generating poster: {e}", exc_info=True)
            raise


def get_poster_service(gemini_api_key: str) -> PosterService:
    """Factory function to create PosterService instance"""
    return PosterService(gemini_api_key)
