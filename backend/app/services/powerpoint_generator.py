import os
import json
import re
from typing import Dict, List, Optional
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.dml import MSO_THEME_COLOR
import shutil

def create_powerpoint_presentation(paper_id: str, scripts_data: dict, metadata: dict, image_assignments: dict = None):
    """Create a complete PowerPoint presentation with bullet points."""
    
    # Load scripts data
    sections = scripts_data.get("sections", {})
    title_intro = scripts_data.get("title_intro_script", "")
    
    # Create PowerPoint presentation
    pptx_file = generate_powerpoint_slides(paper_id, metadata, sections, title_intro, image_assignments or {})
    
    return pptx_file

def generate_powerpoint_slides(paper_id: str, metadata: dict, sections: dict, title_intro: str, image_assignments: dict):
    """Generate complete PowerPoint presentation with bullet points and professional formatting."""
    
    # Create a new presentation
    prs = Presentation()
    
    # Set slide size to widescreen (16:9)
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)
    
    # Title slide
    create_title_slide(prs, metadata, title_intro)
    
    # Content slides for each section in the same order as Beamer
    section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
    
    for section_name in section_order:
        if section_name in sections:
            section_data = sections[section_name]
            
            # Handle both old and new data structures (same as Beamer)
            if isinstance(section_data, dict):
                bullet_points = section_data.get("bullet_points", [])
                assigned_image = section_data.get("assigned_image")
            else:
                bullet_points = []
                assigned_image = None
            
            # Only create slide if we have content
            if bullet_points or assigned_image:
                create_content_slide(
                    prs, 
                    section_name, 
                    bullet_points,
                    assigned_image,
                    paper_id
                )
    
    # Save PowerPoint file
    pptx_dir = f"temp/slides/{paper_id}"
    os.makedirs(pptx_dir, exist_ok=True)
    pptx_file = os.path.join(pptx_dir, f"{paper_id}_presentation.pptx")
    
    prs.save(pptx_file)
    
    return pptx_file

def create_title_slide(prs: Presentation, metadata: dict, title_intro: str):
    """Create the title slide with professional formatting."""
    # Use title slide layout
    title_slide_layout = prs.slide_layouts[0]  # Title slide layout
    slide = prs.slides.add_slide(title_slide_layout)
    
    # Set title
    title = slide.shapes.title
    title_text = clean_text(metadata.get("title", "Research Paper Presentation"))
    title.text = title_text
    
    # Format title
    title_paragraph = title.text_frame.paragraphs[0]
    title_paragraph.font.size = Pt(36)
    title_paragraph.font.bold = True
    title_paragraph.font.color.rgb = RGBColor(0, 51, 102)  # Dark blue
    title_paragraph.alignment = PP_ALIGN.CENTER
    
    # Set subtitle with authors
    subtitle = slide.placeholders[1]
    authors = metadata.get("authors", "")
    authors_clean = clean_text(authors)
    
    if authors_clean:
        subtitle.text = f"Authors: {authors_clean}"
    else:
        subtitle.text = "Research Paper Presentation"
    
    # Format subtitle
    subtitle_paragraph = subtitle.text_frame.paragraphs[0]
    subtitle_paragraph.font.size = Pt(18)
    subtitle_paragraph.font.color.rgb = RGBColor(102, 102, 102)  # Gray
    subtitle_paragraph.alignment = PP_ALIGN.CENTER

def create_content_slide(prs: Presentation, section_name: str, bullet_points: List, assigned_image: Optional[str], paper_id: str):
    """Create a content slide with bullet points and optional image."""
    
    # Choose layout based on whether we have an image
    slide_layout = prs.slide_layouts[1]  # Title and Content layout
    slide = prs.slides.add_slide(slide_layout)
    
    # Set title
    title = slide.shapes.title
    title.text = format_section_name(section_name)
    
    # Format title
    title_paragraph = title.text_frame.paragraphs[0]
    title_paragraph.font.size = Pt(32)
    title_paragraph.font.bold = True
    title_paragraph.font.color.rgb = RGBColor(0, 51, 102)  # Dark blue
    
    if assigned_image:
        # Create two-column layout
        create_two_column_slide(slide, bullet_points, assigned_image, paper_id)
    else:
        # Single column with bullet points
        create_single_column_slide(slide, bullet_points)

def create_two_column_slide(slide, bullet_points: List, assigned_image: str, paper_id: str):
    """Create a slide with bullet points on left and image on right."""
    
    # Add text box for bullet points on the left
    left = Inches(0.5)
    top = Inches(1.8)
    width = Inches(6.5)
    height = Inches(5.2)
    
    textbox = slide.shapes.add_textbox(left, top, width, height)
    text_frame = textbox.text_frame
    text_frame.word_wrap = True
    text_frame.margin_left = Inches(0.1)
    text_frame.margin_right = Inches(0.1)
    text_frame.margin_top = Inches(0.1)
    text_frame.margin_bottom = Inches(0.1)
    
    # Add bullet points
    add_bullet_points_to_frame(text_frame, bullet_points)
    
    # Add image on the right
    try:
        image_path = f"temp/images/{paper_id}/{assigned_image}"
        if os.path.exists(image_path):
            left_img = Inches(7.5)
            top_img = Inches(1.8)
            width_img = Inches(5)
            height_img = Inches(5.2)
            
            slide.shapes.add_picture(image_path, left_img, top_img, width_img, height_img)
    except Exception as e:
        print(f"Warning: Could not add image {assigned_image}: {e}")

def create_single_column_slide(slide, bullet_points: List):
    """Create a slide with bullet points in a single column."""
    
    # Use the content placeholder
    content_placeholder = slide.placeholders[1]
    text_frame = content_placeholder.text_frame
    text_frame.margin_left = Inches(0.2)
    text_frame.margin_right = Inches(0.2)
    text_frame.margin_top = Inches(0.2)
    text_frame.margin_bottom = Inches(0.2)
    
    # Add bullet points
    add_bullet_points_to_frame(text_frame, bullet_points)

def add_bullet_points_to_frame(text_frame, bullet_points: List):
    """Add bullet points to a text frame with professional formatting."""
    
    # Clear existing text
    text_frame.clear()
    
    if not bullet_points:
        # Add default content if no bullet points
        p = text_frame.paragraphs[0]
        p.text = "Key points will be presented here"
        format_bullet_point(p)
        return
    
    # Process and clean bullet points
    cleaned_bullets = []
    for bullet in bullet_points:
        if bullet and str(bullet).strip():
            cleaned_text = clean_bullet_text(bullet)
            if cleaned_text and len(cleaned_text) > 3:  # Avoid very short/meaningless bullets
                cleaned_bullets.append(cleaned_text)
    
    # If no valid bullets after cleaning, add a fallback
    if not cleaned_bullets:
        p = text_frame.paragraphs[0]
        p.text = "Key research findings and insights"
        format_bullet_point(p)
        return
    
    # Add first bullet point
    first_paragraph = text_frame.paragraphs[0]
    first_paragraph.text = cleaned_bullets[0]
    first_paragraph.level = 0
    format_bullet_point(first_paragraph)
    
    # Add remaining bullet points
    for bullet in cleaned_bullets[1:]:
        p = text_frame.add_paragraph()
        p.text = bullet
        p.level = 0
        format_bullet_point(p)

def format_bullet_point(paragraph):
    """Format a bullet point paragraph with consistent styling."""
    paragraph.font.size = Pt(18)
    paragraph.font.color.rgb = RGBColor(51, 51, 51)  # Dark gray
    paragraph.space_after = Pt(8)
    paragraph.space_before = Pt(4)
    paragraph.line_spacing = 1.2

def clean_bullet_text(bullet) -> str:
    """Clean and format bullet point text with comprehensive text processing."""
    if not bullet:
        return ""
    
    text = str(bullet).strip()
    
    # Remove any existing bullet markers
    text = re.sub(r'^[•\-*·◦▪▫‣⁃]\s*', '', text)
    
    # Remove extra whitespace and normalize
    text = ' '.join(text.split())
    
    # Remove common artifacts from text processing
    text = re.sub(r'\s+', ' ', text)  # Multiple spaces to single space
    text = re.sub(r'[^\w\s\-.,;:()&%$#@!?\'\"]+', '', text)  # Remove unusual characters
    
    # Fix common typos and improve readability
    text = fix_common_issues(text)
    
    # Ensure proper capitalization
    if text:
        text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
    
    # Ensure proper sentence ending
    if text and not text.endswith(('.', '!', '?', ':')):
        text += '.'
    
    return text or ""

def fix_common_issues(text: str) -> str:
    """Fix common text processing issues and typos."""
    if not text:
        return ""
    
    # Common replacements for better readability
    replacements = {
        # Fix spacing around punctuation
        r'\s+([,.;:!?])': r'\1',
        r'([,.;:!?])\s+': r'\1 ',
        
        # Fix common technical terms
        r'\bai\b': 'AI',
        r'\bml\b': 'ML',
        r'\bapi\b': 'API',
        r'\bui\b': 'UI',
        r'\bux\b': 'UX',
        r'\bpdf\b': 'PDF',
        r'\bhtml\b': 'HTML',
        r'\bcss\b': 'CSS',
        r'\bjs\b': 'JavaScript',
        r'\bsql\b': 'SQL',
        r'\bhttp\b': 'HTTP',
        r'\burl\b': 'URL',
        r'\bgpu\b': 'GPU',
        r'\bcpu\b': 'CPU',
        r'\bram\b': 'RAM',
        
        # Fix common word combinations
        r'\bdata base\b': 'database',
        r'\bweb site\b': 'website',
        r'\bemail\b': 'email',
        r'\bonline\b': 'online',
        r'\boffline\b': 'offline',
        
        # Remove excessive punctuation
        r'\.{2,}': '.',
        r',{2,}': ',',
        r';{2,}': ';',
        r':{2,}': ':',
        
        # Fix spacing issues
        r'\s+': ' ',
    }
    
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    # Specific technical term capitalizations (case sensitive)
    tech_terms = {
        'javascript': 'JavaScript',
        'python': 'Python',
        'java': 'Java',
        'typescript': 'TypeScript',
        'nodejs': 'Node.js',
        'reactjs': 'React.js',
        'vuejs': 'Vue.js',
        'angularjs': 'Angular.js',
        'github': 'GitHub',
        'linkedin': 'LinkedIn',
        'facebook': 'Facebook',
        'google': 'Google',
        'microsoft': 'Microsoft',
        'amazon': 'Amazon',
        'netflix': 'Netflix',
        'uber': 'Uber',
        'airbnb': 'Airbnb',
    }
    
    for term, proper_case in tech_terms.items():
        text = re.sub(rf'\b{re.escape(term)}\b', proper_case, text, flags=re.IGNORECASE)
    
    return text.strip()

def clean_text(text: str) -> str:
    """Clean general text (for titles, authors, etc.)."""
    if not text:
        return ""
    
    text = str(text).strip()
    
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Remove unwanted characters but keep essential punctuation
    text = re.sub(r'[^\w\s\-.,;:()&%$#@!?\'\"]+', '', text)
    
    # Fix common issues
    text = fix_common_issues(text)
    
    return text

def format_section_name(section_name: str) -> str:
    """Format section name for display with proper capitalization."""
    if not section_name:
        return "Section"
    
    # Convert to title case and clean up
    formatted = section_name.replace('_', ' ').title()
    
    # Handle common section names with proper formatting
    replacements = {
        'Tl Dr': 'TL;DR',
        'Tldr': 'TL;DR', 
        'Abstract': 'Abstract',
        'Introduction': 'Introduction',
        'Methodology': 'Methodology',
        'Method': 'Methodology',
        'Methods': 'Methodology',
        'Results': 'Results',
        'Result': 'Results',
        'Conclusion': 'Conclusion',
        'Conclusions': 'Conclusion',
        'Discussion': 'Discussion',
        'Related Work': 'Related Work',
        'Background': 'Background',
        'Literature Review': 'Literature Review',
        'Evaluation': 'Evaluation',
        'Experiments': 'Experiments',
        'Experiment': 'Experiments',
        'Future Work': 'Future Work',
        'Limitations': 'Limitations',
        'Acknowledgements': 'Acknowledgements',
        'References': 'References'
    }
    
    for old, new in replacements.items():
        if old.lower() in formatted.lower():
            formatted = re.sub(re.escape(old), new, formatted, flags=re.IGNORECASE)
    
    return formatted

def copy_paper_images_for_pptx(image_files: List[str], paper_id: str):
    """Copy paper images to the slides directory for PowerPoint use."""
    if not image_files:
        return
    
    source_dir = f"temp/images/{paper_id}"
    target_dir = f"temp/slides/{paper_id}/images"
    
    os.makedirs(target_dir, exist_ok=True)
    
    for image_file in image_files:
        source_path = os.path.join(source_dir, image_file)
        target_path = os.path.join(target_dir, image_file)
        
        if os.path.exists(source_path):
            try:
                shutil.copy2(source_path, target_path)
            except Exception as e:
                print(f"Warning: Could not copy image {image_file}: {e}")
