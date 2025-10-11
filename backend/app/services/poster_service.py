import os
import google.generativeai as genai
import json
import re
import asyncio
from fastapi import HTTPException
from typing import Dict, Optional, Any, List, Union
import fitz  # PyMuPDF

# --- Configuration ---
GOOGLE_API_KEY = os.getenv("GEMINI_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set.")
genai.configure(api_key=GOOGLE_API_KEY)


def extract_and_clean_json(raw_text: str) -> Dict[str, Any]:
    """Finds and cleans a JSON object from a raw string."""
    print("--- Raw AI Response ---")
    print(raw_text)
    print("-----------------------")
    json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
    if not json_match:
        raise ValueError("Could not find a valid JSON object in the AI response.")
    json_string = json_match.group(0)
    try:
        return json.loads(json_string)
    except json.JSONDecodeError as e:
        print(f"JSON parsing failed: {e}")
        raise ValueError("Failed to parse structured content from AI model after cleaning.")


# --- Main Service Function ---
async def create_poster_pdf(paper_id: str, language: str) -> str:
    """
    Orchestrates a professional poster generation using a multimodal AI model
    and a pure PyMuPDF layout engine with accurate text placement.
    """
    pdf_path = f"temp/papers/{paper_id}/source/paper.pdf"
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"Source PDF not found for paper ID: {paper_id}")

    try:
        print("Uploading file to Google AI for multimodal analysis...")
        paper_file = genai.upload_file(path=pdf_path, display_name=f"paper_{paper_id}")
        print("File uploaded successfully.")

        prompt = [
            "You are an expert research assistant creating a conference poster. Analyze the provided PDF.",
            "Your tasks are:",
            "1. **Summarize Sections with Word Limits:** Create concise summaries for each section. Adhere to these strict word counts: introduction (~120 words), methods (~150 words), results (~150 words), conclusion (~120 words).",
            "2. **Explain Math in English:** DO NOT use LaTeX or math symbols. If you encounter an equation, describe its meaning in plain English. For example, instead of 'e(M) <= l(F/M)', write 'The multiplicity of the module M is less than or equal to the length of the quotient F/M.'",
            "3. **Analyze Images:** Look for figures or charts. If any exist, select the most important one and write a brief caption for it.",
            "4. **Format References:** List the key references as a simple bulleted list.",
            "You MUST return a single, clean JSON object with the keys: "
            "'title', 'authors' (list of strings), 'introduction', 'methods', 'results', 'conclusion', 'image_caption' (a string caption or null if no images), and 'references' (list of strings).",
            "Do not include any text outside the JSON object.",
            paper_file
        ]

        print("Generating content with gemini-1.5-flash...")
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = await model.generate_content_async(prompt)

        try:
            content = extract_and_clean_json(response.text)
        except ValueError as e:
            raise HTTPException(status_code=500, detail=str(e))

        output_dir = f"temp/posters/{paper_id}"
        os.makedirs(output_dir, exist_ok=True)
        pdf_output_path = os.path.join(output_dir, f"poster_{language}.pdf")
        
        poster = PosterGenerator(paper_id, pdf_path, content)
        poster.create(pdf_output_path)

        print(f"Professional PDF poster created successfully: {pdf_output_path}")
        return pdf_output_path

    except Exception as e:
        print(f"An error occurred during poster generation: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


class PosterGenerator:
    """
    Generates a professional poster PDF using PyMuPDF with a dynamic layout
    that accurately calculates text height to prevent overlaps.
    """
    def __init__(self, paper_id: str, source_pdf_path: str, content: Dict[str, Any]):
        self.paper_id = paper_id
        self.source_pdf_path = source_pdf_path
        self.content = content
        self.A0_WIDTH, self.A0_HEIGHT = 2384, 3370
        self.margin = 120
        self.font_regular = "Helvetica"
        self.font_bold = "Helvetica-Bold"
        self.font_italic = "Helvetica-Oblique"
        self.header_bg_color = (0.12, 0.29, 0.49)
        self.header_font_color = (1, 1, 1)
        self.body_font_color = (0.1, 0.1, 0.1)

    def create(self, output_path: str):
        doc = fitz.open()
        page = doc.new_page(width=self.A0_WIDTH, height=self.A0_HEIGHT)
        self._draw_header(page)
        self._draw_body(page)
        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()

    def _draw_header(self, page: fitz.Page):
        header_height = 400
        page.draw_rect(fitz.Rect(0, 0, self.A0_WIDTH, header_height), 
                      color=self.header_bg_color, fill=self.header_bg_color)
        
        title_rect = fitz.Rect(self.margin, 50, self.A0_WIDTH - self.margin, 280)
        page.insert_textbox(title_rect, self.content.get('title', 'Poster Title'), fontsize=88,
                            fontname=self.font_bold, color=self.header_font_color, align=fitz.TEXT_ALIGN_CENTER)
        
        authors = self.content.get('authors', [])
        authors_text = ", ".join(authors) if isinstance(authors, list) else authors
        
        authors_rect = fitz.Rect(self.margin, 280, self.A0_WIDTH - self.margin, 360)
        page.insert_textbox(authors_rect, authors_text, fontsize=48,
                            fontname=self.font_italic, color=self.header_font_color, align=fitz.TEXT_ALIGN_CENTER)

    def _draw_body(self, page: fitz.Page):
        image_path = self._extract_first_image()
        has_image = image_path and self.content.get('image_caption')

        if has_image:
            self._draw_layout_with_image(page, image_path)
        else:
            self._draw_layout_no_image(page)

    def _draw_layout_with_image(self, page: fitz.Page, image_path: str):
        col_width = (self.A0_WIDTH - 3 * self.margin) / 2
        col1_x = self.margin
        col2_x = self.margin * 2 + col_width
        y_positions = [480.0, 480.0]

        # Column 1
        for key in ["introduction", "methods"]:
            height = self._draw_text_block(page, key.capitalize(), self.content.get(key, ""), col1_x, y_positions[0], col_width)
            y_positions[0] += height + 80
        
        # References in Column 1
        height = self._draw_text_block(page, "References", self.content.get("references", []), col1_x, y_positions[0], col_width)
        y_positions[0] += height + 80

        # Column 2: Image
        img_height = col_width * 0.75 # Adjusted aspect ratio for better visuals
        img_rect = fitz.Rect(col2_x, y_positions[1], col2_x + col_width, y_positions[1] + img_height)
        page.insert_image(img_rect, filename=image_path)
        
        caption_rect = fitz.Rect(img_rect.x0, img_rect.y1 + 15, img_rect.x1, img_rect.y1 + 100)
        page.insert_textbox(caption_rect, self.content.get('image_caption', ''), fontsize=28, 
                            fontname=self.font_italic, align=fitz.TEXT_ALIGN_CENTER)
        y_positions[1] += img_rect.height + 120

        # Column 2: Text below image
        for key in ["results", "conclusion"]:
            height = self._draw_text_block(page, key.capitalize(), self.content.get(key, ""), col2_x, y_positions[1], col_width)
            y_positions[1] += height + 80

    def _draw_layout_no_image(self, page: fitz.Page):
        col_width = (self.A0_WIDTH - 4 * self.margin) / 3
        col_starts = [self.margin, self.margin * 2 + col_width, self.margin * 3 + 2 * col_width]
        y_positions = [480.0, 480.0, 480.0]

        sections = [("introduction", 0), ("methods", 0), ("results", 1), 
                    ("conclusion", 1), ("references", 2)]
        
        for section_key, col_index in sections:
            content = self.content.get(section_key, "")
            height_used = self._draw_text_block(page, section_key.capitalize(), content, col_starts[col_index], y_positions[col_index], col_width)
            y_positions[col_index] += height_used + 80

    def _draw_text_block(self, page: fitz.Page, title: str, text_content: Union[str, List[str]], x: float, y: float, width: float) -> float:
        """
        Draws a text block, handling both strings and lists of strings (like references),
        and returns the precise vertical space used.
        """
        title_height = 80
        padding = 20
        
        title_rect = fitz.Rect(x, y, x + width, y + title_height)
        page.insert_textbox(title_rect, title, fontsize=52, fontname=self.font_bold, color=self.header_bg_color)
        
        line_y = y + title_height
        page.draw_line(fitz.Point(x, line_y), fitz.Point(x + width, line_y), color=self.header_bg_color, width=4)

        font = fitz.Font(self.font_regular)
        fontsize = 34
        line_height = fontsize * 1.2
        current_y = line_y + padding

        # --- DEFINITIVE FIX FOR REFERENCES ---
        # This block now correctly handles lists by processing each item separately.
        if isinstance(text_content, list):
            for i, item in enumerate(text_content):
                # Add a bullet point to each reference item
                text_to_draw = f"• {item}"
                
                words = text_to_draw.split(' ')
                current_line = ""
                while words:
                    word = words.pop(0)
                    # Check if the line is too long
                    if font.text_length(current_line + " " + word, fontsize=fontsize) < width:
                        current_line += " " + word
                    else:
                        current_y += line_height
                        page.insert_text((x, current_y), current_line.strip(), fontsize=fontsize, fontname=self.font_regular, color=self.body_font_color)
                        current_line = word
                
                # Draw the last line of the item
                current_y += line_height
                page.insert_text((x, current_y), current_line.strip(), fontsize=fontsize, fontname=self.font_regular, color=self.body_font_color)
                
                # Add extra padding between reference items, but not after the last one
                if i < len(text_content) - 1:
                    current_y += line_height * 0.5 

        # This is the original logic for single string content
        else:
            text = text_content or ""
            words = text.split(' ')
            current_line = ""
            while words:
                word = words.pop(0)
                if font.text_length(current_line + " " + word, fontsize=fontsize) < width:
                    current_line += " " + word
                else:
                    current_y += line_height
                    page.insert_text((x, current_y), current_line.strip(), fontsize=fontsize, fontname=self.font_regular, color=self.body_font_color)
                    current_line = word
            
            # Draw the final line
            current_y += line_height
            page.insert_text((x, current_y), current_line.strip(), fontsize=fontsize, fontname=self.font_regular, color=self.body_font_color)

        # Calculate the total height used by the content
        content_height = (current_y - (line_y + padding))
        
        return title_height + padding + content_height + (line_height if text_content else 0)

    def _extract_first_image(self) -> Optional[str]:
        """Extracts the first large image from the source PDF."""
        try:
            doc = fitz.open(self.source_pdf_path)
            for page_num in range(len(doc)):
                for img in doc.get_page_images(page_num):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    
                    # A simple heuristic to find a reasonably sized image
                    if len(image_bytes) > 100 * 1024: # Greater than 100 KB
                        image_path = f"temp/posters/{self.paper_id}/extracted_image.png"
                        with open(image_path, "wb") as f:
                            f.write(image_bytes)
                        return image_path
            return None
        except Exception as e:
            print(f"Could not extract image from PDF: {e}")
            return None