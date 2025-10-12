import os
import google.generativeai as genai
import json
import re
import asyncio
from fastapi import HTTPException
from typing import Dict, Optional, Any, List
import fitz  # PyMuPDF
from abc import ABC, abstractmethod
from app.services.storage_manager import storage_manager

# --- Configuration ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable not set.")
genai.configure(api_key=GOOGLE_API_KEY)


def extract_and_clean_json(raw_text: str) -> Dict[str, Any]:
    # Regex to find JSON block, even with markdown ```json ... ```
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_text, re.DOTALL)
    if not json_match:
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not json_match:
            raise ValueError("Could not find a valid JSON object in the AI response.")
    
    json_string = json_match.group(1)
    try:
        return json.loads(json_string)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse structured content from AI model: {e}")


# --- Template Base Class ---
class PosterTemplate(ABC):
    def __init__(self, paper_id: str, content: Dict[str, Any], image_path: Optional[str] = None):
        self.paper_id = paper_id
        self.content = content
        self.image_path = image_path
        self.A0_WIDTH, self.A0_HEIGHT = 2384, 3370
        self.margin = 120
        self.doc = fitz.open()
        self.page = self.doc.new_page(width=self.A0_WIDTH, height=self.A0_HEIGHT)
        self._set_styles()

    @abstractmethod
    def _set_styles(self): pass
    @abstractmethod
    def draw_header(self): pass
    @abstractmethod
    def draw_body(self): pass

    def create(self, output_path: str):
        self.draw_header()
        self.draw_body()
        self.doc.save(output_path, garbage=4, deflate=True, clean=True)
        self.doc.close()

    def _draw_text_block(self, page, title, text_content, x, y, width):
        padding = 40
        title_height = 80
        title_content_gap = 35
        fontsize = 32 
        line_height = fontsize * 1.25
        font = fitz.Font(self.font_regular)
        
        text_content_str = "\n".join(text_content) if isinstance(text_content, list) else str(text_content or "")
        
        text_length = font.text_length(text_content_str, fontsize=fontsize)
        
        num_lines = (text_length / (width - 2 * padding)) + text_content_str.count('\n')
        content_height = num_lines * line_height * 1.5

        total_height = title_height + title_content_gap + content_height + (2 * padding)
        box_rect = fitz.Rect(x, y, x + width, y + total_height)
        if box_rect.y1 > (self.A0_HEIGHT - self.margin):
            box_rect.y1 = self.A0_HEIGHT - self.margin

        page.draw_rect(box_rect, color=self.box_border_color, fill=self.box_bg_color, width=2)
        
        title_rect = fitz.Rect(x + padding, y + 15, x + width - padding, y + title_height)
        page.insert_textbox(title_rect, title, fontsize=48, fontname=self.font_bold, color=self.title_font_color, align=1)
        
        content_rect = fitz.Rect(x + padding, y + title_height + title_content_gap, x + width - padding, box_rect.y1 - padding)
        page.insert_textbox(
            content_rect,
            text_content_str,
            fontsize=fontsize, fontname=self.font_regular, color=self.body_font_color
        )
        return box_rect.height

    def _draw_image_block(self, page, x, y, width):
        if not self.image_path or not os.path.exists(self.image_path):
            return 0
        padding = 35
        try:
            with fitz.open(self.image_path) as img:
                img_rect = img[0].rect
                aspect_ratio = img_rect.width / img_rect.height
                img_width = width - (2 * padding)
                img_height = img_width / aspect_ratio
                if y + img_height > self.A0_HEIGHT - self.margin: return 0
                img_x = x + (width - img_width) / 2
                image_rect = fitz.Rect(img_x, y, img_x + img_width, y + img_height)
                page.insert_image(image_rect, filename=self.image_path)
                return img_height + 20 # Add padding
        except Exception as e:
            print(f"Error drawing image {self.image_path}: {e}")
            return 0


# --- Template Implementations ---
class ModernBlueTemplate(PosterTemplate):
    def _set_styles(self):
        self.font_regular, self.font_bold, self.font_italic = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
        self.header_bg_color = (0.12, 0.29, 0.49); self.header_font_color = (1, 1, 1)
        self.body_font_color = (0.1, 0.1, 0.1); self.title_font_color = self.header_bg_color
        self.box_bg_color = (0.96, 0.97, 0.98); self.box_border_color = (0.85, 0.90, 0.95)
    def draw_header(self):
        header_rect = fitz.Rect(0, 0, self.A0_WIDTH, 400)
        self.page.draw_rect(header_rect, color=self.header_bg_color, fill=self.header_bg_color)
        title_rect = fitz.Rect(header_rect.x0 + 50, header_rect.y0 + 50, header_rect.x1 - 50, header_rect.y1 - 150)
        authors_rect = fitz.Rect(header_rect.x0 + 50, header_rect.y0 + 150, header_rect.x1 - 50, header_rect.y1 - 50)
        self.page.insert_textbox(title_rect, self.content.get('title', 'Poster Title'), fontsize=88, fontname=self.font_bold, color=self.header_font_color, align=1)
        self.page.insert_textbox(authors_rect, ", ".join(self.content.get('authors', []) or []), fontsize=48, fontname=self.font_italic, color=self.header_font_color, align=1)
    def draw_body(self):
        col_width = (self.A0_WIDTH - 4 * self.margin) / 3
        col_starts = [self.margin, self.margin * 2 + col_width, self.margin * 3 + 2 * col_width]
        y_pos = [480.0, 480.0, 480.0]; v_gap = 60
        sections = [("introduction", 0), ("methods", 1), ("results", 2), ("conclusion", 0), ("references", 1)]
        for key, col_idx in sections:
            height = self._draw_text_block(self.page, key.capitalize(), self.content.get(key, ""), col_starts[col_idx], y_pos[col_idx], col_width)
            y_pos[col_idx] += height + v_gap
        image_height = self._draw_image_block(self.page, col_starts[2], y_pos[2], col_width)
        if image_height > 0: y_pos[2] += image_height + v_gap

class ClassicIvoryTemplate(PosterTemplate):
    def _set_styles(self):
        self.font_regular, self.font_bold, self.font_italic = "Times-Roman", "Times-Bold", "Times-Italic"
        self.bg_color = (0.98, 0.97, 0.94); self.header_font_color = (0.1, 0.1, 0.1)
        self.body_font_color = (0.2, 0.2, 0.2); self.title_font_color = (0.5, 0.0, 0.13)
        self.box_bg_color = (1, 1, 1); self.box_border_color = (0.9, 0.88, 0.85)
    def draw_header(self):
        self.page.draw_rect(self.page.rect, color=self.bg_color, fill=self.bg_color)
        title_rect = self.page.rect + (80, 80, -80, -2820); authors_rect = self.page.rect + (80, 180, -80, -2920)
        self.page.insert_textbox(title_rect, self.content.get('title', 'Poster Title'), fontsize=100, fontname=self.font_bold, color=self.header_font_color, align=1)
        self.page.insert_textbox(authors_rect, ", ".join(self.content.get('authors', []) or []), fontsize=52, fontname=self.font_italic, color=self.body_font_color, align=1)
        line_y = 350; self.page.draw_line(fitz.Point(self.margin, line_y), fitz.Point(self.A0_WIDTH - self.margin, line_y), color=self.title_font_color, width=5)
    def draw_body(self):
        col_width = (self.A0_WIDTH - 4 * self.margin) / 3
        col_starts = [self.margin, self.margin * 2 + col_width, self.margin * 3 + 2 * col_width]
        y_pos = [420.0, 420.0, 420.0]; v_gap = 60
        sections = [("introduction", 0), ("methods", 1), ("results", 2), ("conclusion", 0), ("references", 1)]
        for key, col_idx in sections:
            height = self._draw_text_block(self.page, key.capitalize(), self.content.get(key, ""), col_starts[col_idx], y_pos[col_idx], col_width)
            y_pos[col_idx] += height + v_gap
        image_height = self._draw_image_block(self.page, col_starts[2], y_pos[2], col_width)
        if image_height > 0: y_pos[2] += image_height + v_gap

class SynthwaveTemplate(PosterTemplate):
    def _set_styles(self):
        self.font_regular, self.font_bold = "Courier", "Courier-Bold"
        self.bg_color = (0.1, 0.05, 0.2); self.header_font_color = (1, 1, 1)
        self.title_font_color = (0.9, 0.1, 0.5); self.body_font_color = (0.8, 0.9, 1.0)
        self.box_bg_color = (0.15, 0.1, 0.25); self.box_border_color = self.title_font_color
    def draw_header(self):
        self.page.draw_rect(self.page.rect, color=self.bg_color, fill=self.bg_color)
        title_rect = self.page.rect + (80, 80, -80, -2820); authors_rect = self.page.rect + (80, 180, -80, -2920)
        self.page.insert_textbox(title_rect, self.content.get('title', 'Poster Title'), fontsize=90, fontname=self.font_bold, color=self.header_font_color, align=1)
        self.page.insert_textbox(authors_rect, ", ".join(self.content.get('authors', []) or []), fontsize=50, fontname=self.font_regular, color=self.body_font_color, align=1)
    def draw_body(self):
        col_width = (self.A0_WIDTH - 4 * self.margin) / 3
        col_starts = [self.margin, self.margin * 2 + col_width, self.margin * 3 + 2 * col_width]
        y_pos = [400.0, 400.0, 400.0]; v_gap = 60
        sections = [("introduction", 0), ("methods", 1), ("results", 2), ("conclusion", 0), ("references", 1)]
        for key, col_idx in sections:
            height = self._draw_text_block(self.page, f"// {key.upper()}", self.content.get(key, ""), col_starts[col_idx], y_pos[col_idx], col_width)
            y_pos[col_idx] += height + v_gap
        image_height = self._draw_image_block(self.page, col_starts[2], y_pos[2], col_width)
        if image_height > 0: y_pos[2] += image_height + v_gap

class ForestTemplate(PosterTemplate):
    def _set_styles(self):
        self.font_regular, self.font_bold = "Helvetica", "Helvetica-Bold"
        self.bg_color = (0.95, 0.98, 0.95); self.header_bg_color = (0.1, 0.2, 0.15)
        self.header_font_color = (0.9, 0.95, 0.9); self.title_font_color = self.header_bg_color
        self.body_font_color = (0.2, 0.2, 0.2); self.box_bg_color = (1, 1, 1)
        self.box_border_color = (0.8, 0.85, 0.8)
    def draw_header(self):
        self.page.draw_rect(self.page.rect, color=self.bg_color, fill=self.bg_color)
        header_rect = fitz.Rect(0, 0, self.A0_WIDTH, 380)
        self.page.draw_rect(header_rect, color=self.header_bg_color, fill=self.header_bg_color)
        title_rect = header_rect + (50, 50, -50, -150); authors_rect = header_rect + (50, 150, -50, -50)
        self.page.insert_textbox(title_rect, self.content.get('title', 'Poster Title'), fontsize=90, fontname=self.font_bold, color=self.header_font_color, align=1)
        self.page.insert_textbox(authors_rect, ", ".join(self.content.get('authors', []) or []), fontsize=50, fontname=self.font_regular, color=self.header_font_color, align=1)
    def draw_body(self):
        col_width = (self.A0_WIDTH - 3 * self.margin) / 2
        col_starts = [self.margin, self.margin * 2 + col_width]
        y_pos = [450.0, 450.0]; v_gap = 60
        sections = [("introduction", 0), ("methods", 0), ("results", 1), ("conclusion", 1), ("references", 1)]
        for key, col_idx in sections:
            height = self._draw_text_block(self.page, key.capitalize(), self.content.get(key, ""), col_starts[col_idx], y_pos[col_idx], col_width)
            y_pos[col_idx] += height + v_gap
        image_height = self._draw_image_block(self.page, col_starts[1], y_pos[1], col_width)
        if image_height > 0: y_pos[1] += image_height + v_gap

# --- Main Service Function (Factory) ---
async def create_poster_pdf(paper_id: str, language: str, template: str) -> str:
    pdf_path = f"temp/papers/{paper_id}/source/paper.pdf"
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="Source PDF not found")
        
    try:
        paper_file = genai.upload_file(path=pdf_path)
        
        prompt = [
            "You are a scientific communication expert. Your task is to extract and summarize content from the provided research paper to create a conference poster.",
            "You MUST return a single, clean JSON object. Do not include any text or formatting outside of the JSON object.",
            "The JSON object must contain the following keys, and none of them are optional:",
            "- `title`: The full title of the paper.",
            "- `authors`: A list of strings, with each string being an author's name.",
            "- `introduction`: A concise summary of the paper's introduction (around 100 words).",
            "- `methods`: A concise summary of the methodology (around 120 words). If you cannot find a methods section, return an empty string.",
            "- `results`: A concise summary of the key results and findings (around 120 words).",
            "- `conclusion`: A brief summary of the conclusion (around 100 words).",
            "- `references`: A list of strings for 3-5 key references from the paper. If you cannot find any references, return an empty list.",
            "IMPORTANT: Do not use LaTeX or mathematical symbols. Explain any equations in plain English.",
            paper_file
        ]
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = await model.generate_content_async(prompt)
        content = extract_and_clean_json(response.text)

        # ---- NEW AND IMPROVED IMAGE HANDLING LOGIC ----
        # This logic directly scans the images directory, just like the old working version.
        first_image_path = None
        image_dir = f"temp/papers/{paper_id}/images"
        if os.path.exists(image_dir):
            # List all files in the directory and filter for common image formats
            image_files = [f for f in os.listdir(image_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp'))]
            if image_files:
                # Sort the files to ensure a consistent choice and get the full path of the first image
                image_files.sort()
                first_image_path = os.path.join(image_dir, image_files[0])
        # ---- END OF NEW LOGIC ----

        output_path = f"temp/posters/{paper_id}/poster_{template}_{language}.pdf"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        template_map = {
            'modern_blue': ModernBlueTemplate,
            'classic_ivory': ClassicIvoryTemplate,
            'synthwave': SynthwaveTemplate,
            'forest': ForestTemplate
        }
        
        generator_class = template_map.get(template, ModernBlueTemplate)
        generator = generator_class(paper_id, content, first_image_path)
        generator.create(output_path)
        
        return output_path
        
    except Exception as e:
        print(f"Error in create_poster_pdf: {type(e).__name__} - {e}")
        raise HTTPException(status_code=500, detail=str(e))