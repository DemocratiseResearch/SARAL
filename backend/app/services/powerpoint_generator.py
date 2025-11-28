"""
PowerPoint Generation Service

This module provides functionality to generate PowerPoint presentations from research papers
while preserving the exact styling of template slides. It uses Google's Gemini AI model
to extract content from research papers and populate PowerPoint templates with intelligent
content generation.

Key Features:
- Surgical text replacement that preserves formatting, fonts, and colors
- AI-powered content extraction from research papers
- Template-based presentation generation
- Metadata extraction (titles, authors) from research papers
- Intelligent content distribution across slides

Dependencies:
- python-pptx: For PowerPoint file manipulation
- google-generativeai: For AI content generation
- re, time: Built-in Python modules
"""

import re
import time
import logging
from typing import Tuple, List, Optional
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.util import Pt
    import google.generativeai as genai
    from google.generativeai.types import HarmCategory, HarmBlockThreshold
except ImportError as e:
    raise ImportError(
        "Required dependencies not installed. Please install: pip install python-pptx google-generativeai"
    ) from e

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PowerPointGeneratorConfig:
    """Configuration class for PowerPoint Generator"""
    
    def __init__(self, gemini_api_key: str):
        """
        Initialize configuration with Gemini API key
        
        Args:
            gemini_api_key (str): Google Gemini API key for AI content generation
        """
        self.gemini_api_key = gemini_api_key
        self.model_name = 'gemini-2.5-flash'
        self.safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }


class PowerPointGenerator:
    """
    Main class for generating PowerPoint presentations from research papers.
    
    This class handles the entire pipeline from reading research paper text,
    extracting metadata, generating content using AI, and populating PowerPoint
    templates while preserving styling.
    """
    
    def __init__(self, config: PowerPointGeneratorConfig):
        """
        Initialize PowerPoint Generator with configuration
        
        Args:
            config (PowerPointGeneratorConfig): Configuration object containing API keys and settings
        """
        self.config = config
        self._setup_gemini()
    
    def _setup_gemini(self) -> None:
        """Configure Google Gemini AI model for content generation"""
        try:
            genai.configure(api_key=self.config.gemini_api_key)
            self.model = genai.GenerativeModel(self.config.model_name)
            logger.info("Gemini AI model configured successfully")
        except Exception as e:
            logger.error(f"Failed to configure Gemini AI: {e}")
            raise
    
    @staticmethod
    def surgical_text_replace(text_frame, new_text: str) -> None:
        """
        Replace text in a PowerPoint text frame while preserving all formatting.
        
        This is the core function that enables style preservation. It replaces
        text without clearing formatting by injecting new text into existing
        run objects, maintaining theme colors, RGB colors, fonts, and styling.
        
        Args:
            text_frame: PowerPoint text frame object
            new_text (str): New text content to insert
        """
        if not text_frame.paragraphs:
            return

        # Target the first paragraph
        paragraph = text_frame.paragraphs[0]

        # If no runs exist (empty box), add one to hold text
        if not paragraph.runs:
            paragraph.add_run()

        # Inject new text into the FIRST run to keep existing style
        paragraph.runs[0].text = new_text

        # Clear any subsequent runs in this paragraph
        for run in paragraph.runs[1:]:
            run.text = ""

        # Clear subsequent paragraphs to avoid overflow/duplication
        for para in text_frame.paragraphs[1:]:
            para.clear()

        # Apply minimal auto-fit for very long text
        PowerPointGenerator._apply_auto_fit(paragraph, new_text)
    
    @staticmethod
    def _apply_auto_fit(paragraph, text: str) -> None:
        """
        Apply minimal auto-fit to text based on length.
        
        Args:
            paragraph: PowerPoint paragraph object
            text (str): Text content to analyze for length
        """
        if len(text) > 600:
            if paragraph.runs[0].font.size:
                paragraph.runs[0].font.size = Pt(paragraph.runs[0].font.size.pt * 0.7)
        elif len(text) > 300:
            if paragraph.runs[0].font.size:
                paragraph.runs[0].font.size = Pt(paragraph.runs[0].font.size.pt * 0.85)
    
    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Normalize text by removing extra whitespace and trimming.
        
        Args:
            text (str): Raw text to normalize
            
        Returns:
            str: Normalized text with single spaces and trimmed edges
        """
        if not text:
            return ""
        return re.sub(r"\s+", " ", text).strip()
    
    @staticmethod
    def is_lorem_ipsum(text: str) -> bool:
        """
        Check if text contains Lorem Ipsum placeholder content.
        
        Args:
            text (str): Text to check
            
        Returns:
            bool: True if text contains Lorem Ipsum markers
        """
        text_lower = text.lower()
        return "lorem" in text_lower and "ipsum" in text_lower
    
    @staticmethod
    def get_font_size(paragraph):
        """
        Extract font size from paragraph, with fallback.
        
        Args:
            paragraph: PowerPoint paragraph object
            
        Returns:
            Font size object or default 12pt
        """
        if paragraph.runs and paragraph.runs[0].font.size:
            return paragraph.runs[0].font.size
        return Pt(12)
    
    def extract_metadata(self, full_text: str) -> Tuple[str, List[str]]:
        """
        Extract title and authors from research paper text using AI.
        
        Args:
            full_text (str): Complete research paper content
            
        Returns:
            Tuple[str, List[str]]: Title and list of author names
        """
        prompt = f"""
        Extract Title and Authors from this research paper text.
        Format your response exactly as:
        TITLE: <extracted title>
        AUTHORS: <author1>, <author2>, <author3>
        
        TEXT: {full_text[:5000]}
        """
        
        try:
            response = self.model.generate_content(prompt, safety_settings=self.config.safety_settings)
            lines = response.text.split('\n')
            
            title = "Research Paper"
            authors = []
            
            for line in lines:
                if "TITLE:" in line:
                    title = line.replace("TITLE:", "").strip()
                if "AUTHORS:" in line:
                    author_list = line.replace("AUTHORS:", "").strip()
                    authors = [author.strip() for author in author_list.split(',')]
            
            logger.info(f"Extracted metadata - Title: {title}, Authors: {len(authors)} found")
            return title, authors
            
        except Exception as e:
            logger.error(f"Failed to extract metadata: {e}")
            return "Unknown Title", ["Author 1", "Author 2"]
    
    def generate_slide_content(self, section: str, box_index: int, total_boxes: int, 
                             full_text: str, target_length: int) -> str:
        """
        Generate content for a specific text box on a slide using AI.
        
        Args:
            section (str): Section name or topic for the slide
            box_index (int): Current text box number (1-based)
            total_boxes (int): Total number of text boxes on slide
            full_text (str): Complete research paper content
            target_length (int): Approximate target character length
            
        Returns:
            str: Generated content for the text box
        """
        prompt = f"""
        Write presentation content for section: "{section}".
        This is text box {box_index} of {total_boxes} on the slide.

        SOURCE TEXT: {full_text[:20000]}

        INSTRUCTIONS:
        1. Write a specific summary for this text box
        2. If box 1, write overview. If box 2+, write supporting details
        3. Use plain text only, no markdown formatting
        4. Target approximately {target_length} characters
        5. Be concise and presentation-friendly
        6. Focus on key points relevant to "{section}"
        """
        
        try:
            # Rate limiting to avoid API quota issues
            time.sleep(1.0)
            
            response = self.model.generate_content(prompt, safety_settings=self.config.safety_settings)
            content = self.normalize_text(response.text)
            
            logger.info(f"Generated content for {section}, box {box_index}: {len(content)} chars")
            return content
            
        except Exception as e:
            logger.error(f"Failed to generate content for {section}: {e}")
            return f"Content for {section}"
    
    def process_presentation(self, input_pptx_path: str, input_text_path: str, 
                           output_pptx_path: str) -> bool:
        """
        Process a complete PowerPoint presentation with research paper content.
        
        This is the main processing function that:
        1. Loads the template presentation and research paper text
        2. Extracts metadata from the paper
        3. Processes each slide according to its purpose
        4. Saves the final presentation
        
        Args:
            input_pptx_path (str): Path to PowerPoint template file
            input_text_path (str): Path to research paper text file
            output_pptx_path (str): Path where final presentation will be saved
            
        Returns:
            bool: True if processing successful, False otherwise
        """
        logger.info("Starting PowerPoint generation process")
        
        try:
            # Load presentation and text
            presentation = Presentation(input_pptx_path)
            with open(input_text_path, 'r', encoding='utf-8', errors='ignore') as file:
                paper_text = file.read()
            
            logger.info(f"Loaded presentation with {len(presentation.slides)} slides")
            
            # Extract metadata
            title, authors = self.extract_metadata(paper_text)
            
            # Process each slide
            for slide_index, slide in enumerate(presentation.slides):
                logger.info(f"Processing slide {slide_index + 1}/{len(presentation.slides)}")
                
                if slide_index == 0:
                    # Title slide processing
                    self._process_title_slide(slide, title, authors)
                else:
                    # Content slide processing
                    self._process_content_slide(slide, paper_text)
            
            # Save final presentation
            presentation.save(output_pptx_path)
            logger.info(f"Presentation saved successfully to: {output_pptx_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing presentation: {e}")
            return False
    
    def _process_title_slide(self, slide, title: str, authors: List[str]) -> None:
        """
        Process the title slide with title and author information.
        
        Args:
            slide: PowerPoint slide object
            title (str): Paper title
            authors (List[str]): List of author names
        """
        text_shapes = [shape for shape in slide.shapes 
                      if shape.has_text_frame and shape.text_frame.text.strip()]
        
        if not text_shapes:
            return

        # Sort by font size to identify title (largest text)
        text_shapes.sort(key=lambda s: self.get_font_size(s.text_frame.paragraphs[0]).pt, reverse=True)

        # Set title
        self.surgical_text_replace(text_shapes[0].text_frame, title)
        logger.info("Title style preserved and content updated")

        # Process author text boxes (those with Lorem Ipsum)
        author_shapes = [shape for shape in text_shapes[1:] 
                        if self.is_lorem_ipsum(shape.text_frame.text)]
        author_shapes.sort(key=lambda s: (s.top, s.left))

        for index, shape in enumerate(author_shapes):
            if index < len(authors):
                self.surgical_text_replace(shape.text_frame, authors[index])
            else:
                shape.text_frame.text = ""  # Clear unused author boxes
        
        logger.info(f"Processed {len(author_shapes)} author text boxes")
    
    def _process_content_slide(self, slide, paper_text: str) -> None:
        """
        Process content slides with research paper information.
        
        Args:
            slide: PowerPoint slide object
            paper_text (str): Complete research paper text
        """
        # Identify slide section/topic
        section_title = self._identify_slide_section(slide)
        
        # Find content text boxes (those with Lorem Ipsum placeholder)
        content_shapes = [shape for shape in slide.shapes 
                         if shape.has_text_frame and self.is_lorem_ipsum(shape.text_frame.text)]

        # Generate content for each text box
        for index, shape in enumerate(content_shapes):
            current_length = len(shape.text_frame.text)
            new_content = self.generate_slide_content(
                section_title, index + 1, len(content_shapes), paper_text, current_length
            )
            
            # Apply surgical text replacement to preserve styling
            self.surgical_text_replace(shape.text_frame, new_content)
            logger.info(f"Updated content box {index + 1} for section: {section_title}")
    
    def _identify_slide_section(self, slide) -> str:
        """
        Identify the section/topic of a slide from its header text.
        
        Args:
            slide: PowerPoint slide object
            
        Returns:
            str: Section name or "General" if not identified
        """
        section_keywords = ['introduction', 'methodology', 'results', 'discussion', 'conclusion']
        
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = shape.text_frame.text.strip().lower()
                for keyword in section_keywords:
                    if keyword in text:
                        return shape.text_frame.text.strip()
        
        return "General"


def create_powerpoint_from_paper(gemini_api_key: str, template_path: str, 
                                text_file_path: str, output_path: str) -> bool:
    """
    Convenience function to generate PowerPoint presentation from research paper.
    
    Args:
        gemini_api_key (str): Google Gemini API key
        template_path (str): Path to PowerPoint template file
        text_file_path (str): Path to research paper text file
        output_path (str): Path where generated presentation will be saved
        
    Returns:
        bool: True if generation successful, False otherwise
    
    Example:
        >>> success = create_powerpoint_from_paper(
        ...     "your-api-key",
        ...     "/path/to/template.pptx",
        ...     "/path/to/paper.txt",
        ...     "/path/to/output.pptx"
        ... )
    """
    try:
        config = PowerPointGeneratorConfig(gemini_api_key)
        generator = PowerPointGenerator(config)
        return generator.process_presentation(template_path, text_file_path, output_path)
    except Exception as e:
        logger.error(f"Failed to create PowerPoint: {e}")
        return False


# Example usage and testing
if __name__ == "__main__":
    # Example configuration
    API_KEY = "your-gemini-api-key-here"
    TEMPLATE_FILE = "/path/to/template.pptx"
    TEXT_FILE = "/path/to/research_paper.txt"
    OUTPUT_FILE = "/path/to/generated_presentation.pptx"
    
    # Validate input files exist
    if not Path(TEMPLATE_FILE).exists():
        print(f"Template file not found: {TEMPLATE_FILE}")
    elif not Path(TEXT_FILE).exists():
        print(f"Text file not found: {TEXT_FILE}")
    elif "your-gemini-api-key" in API_KEY:
        print("Please set a valid Gemini API key")
    else:
        # Generate presentation
        success = create_powerpoint_from_paper(API_KEY, TEMPLATE_FILE, TEXT_FILE, OUTPUT_FILE)
        if success:
            print(f"Presentation generated successfully: {OUTPUT_FILE}")
        else:
            print("Failed to generate presentation")