import google.generativeai as genai
from typing import List, Dict, Optional
from app.models.request_models import Flashcard
from app.services.script_generator import extract_text_from_file, clean_text
import logging

logger = logging.getLogger(__name__)

def generate_flashcards_from_paper(
    paper_info: Dict,
    scripts_info: Optional[Dict],
    api_key: str,
    num_flashcards: int = 8
) -> List[Flashcard]:
    """Generate meaningful flashcards from actual paper content and scripts."""
    
    # Configure Gemini
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    # Get paper content
    content_sources = []
    
    # Add paper metadata
    metadata = paper_info.get("metadata", {})
    title = metadata.get("title", "Research Paper")
    authors = metadata.get("authors", "Authors")
    
    content_sources.append(f"Paper Title: {title}")
    content_sources.append(f"Authors: {authors}")
    
    # Add script sections if available
    if scripts_info and "sections" in scripts_info:
        sections = scripts_info["sections"]
        content_sources.append("\n=== PAPER CONTENT SUMMARY ===")
        
        for section_name, section_data in sections.items():
            if isinstance(section_data, dict):
                script = section_data.get("script", "")
                bullets = section_data.get("bullet_points", [])
                
                content_sources.append(f"\n{section_name.upper()}:")
                content_sources.append(script)
                
                if bullets:
                    content_sources.append("Key Points:")
                    for bullet in bullets:
                        content_sources.append(f"• {bullet}")
    else:
        # Fallback: extract text directly from paper file
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
        else:
            raise ValueError("No text file found in paper info")
        
        raw_text = extract_text_from_file(file_path)
        cleaned_text = clean_text(raw_text)
        content_sources.append("\n=== PAPER CONTENT ===")
        content_sources.append(cleaned_text[:3000])  # Limit to avoid token limits
    
    paper_content = "\n".join(content_sources)
    
    # Create prompt for generating flashcards
    prompt = f"""
Generate {num_flashcards} educational flashcards for this research paper. Each flashcard should:

1. Have a clear KEY POINT that summarizes an important concept from the paper
2. Have a QUESTION that tests understanding of that concept
3. Follow the structure and flow of the paper (Introduction → Methodology → Results → Discussion → Conclusion)
4. Be educational and help someone understand the research
5. Use simple, clear language suitable for learning

Paper Content:
{paper_content}

Format your response as a numbered list like this:
1. KEY POINT: [Main concept or finding]
   QUESTION: [Thoughtful question about this concept]

2. KEY POINT: [Next concept]
   QUESTION: [Related question]

Continue for all {num_flashcards} flashcards, covering the main aspects of the research in order.
"""

    try:
        # Generate flashcards using Gemini
        response = model.generate_content(prompt)
        flashcard_text = response.text
        
        # Parse the response into flashcard objects
        flashcards = parse_flashcard_response(flashcard_text, title)
        
        # Ensure we have the requested number of flashcards
        if len(flashcards) < num_flashcards:
            # Fill remaining with basic flashcards if needed
            for i in range(len(flashcards), num_flashcards):
                flashcards.append(Flashcard(
                    id=i+1,
                    key_point=f"Additional key concept {i+1} from the research",
                    question=f"What are the implications of this finding for the field?",
                    image_url=generate_science_image_url(title)
                ))
        
        return flashcards[:num_flashcards]
        
    except Exception as e:
        logger.error(f"Error generating flashcards with Gemini: {str(e)}")
        # Fallback to basic flashcards
        return generate_fallback_flashcards(title, num_flashcards)

def parse_flashcard_response(response_text: str, paper_title: str) -> List[Flashcard]:
    """Parse Gemini response into Flashcard objects."""
    flashcards = []
    lines = response_text.split('\n')
    
    current_key_point = ""
    current_question = ""
    card_id = 1
    
    for line in lines:
        line = line.strip()
        
        if "KEY POINT:" in line:
            current_key_point = line.split("KEY POINT:", 1)[1].strip()
        elif "QUESTION:" in line:
            current_question = line.split("QUESTION:", 1)[1].strip()
            
            # Create flashcard when we have both components
            if current_key_point and current_question:
                flashcards.append(Flashcard(
                    id=card_id,
                    key_point=current_key_point,
                    question=current_question,
                    image_url=generate_science_image_url(paper_title)
                ))
                card_id += 1
                current_key_point = ""
                current_question = ""
    
    return flashcards

def generate_science_image_url(paper_title: str) -> str:
    """Generate appropriate background image URLs based on paper topic."""
    title_lower = paper_title.lower()
    
    # Match topics to appropriate images
    if any(word in title_lower for word in ['neural', 'ai', 'machine learning', 'deep learning', 'computer']):
        return "https://source.unsplash.com/400x300/?artificial,intelligence,technology"
    elif any(word in title_lower for word in ['medical', 'health', 'clinical', 'therapy', 'disease']):
        return "https://source.unsplash.com/400x300/?medical,research,healthcare"
    elif any(word in title_lower for word in ['environment', 'climate', 'sustainability', 'energy']):
        return "https://source.unsplash.com/400x300/?environment,science,climate"
    elif any(word in title_lower for word in ['physics', 'quantum', 'particle', 'space']):
        return "https://source.unsplash.com/400x300/?physics,science,laboratory"
    elif any(word in title_lower for word in ['chemistry', 'chemical', 'molecular']):
        return "https://source.unsplash.com/400x300/?chemistry,laboratory,research"
    elif any(word in title_lower for word in ['biology', 'biological', 'genetic', 'cell']):
        return "https://source.unsplash.com/400x300/?biology,laboratory,microscope"
    else:
        return "https://source.unsplash.com/400x300/?research,science,education"

def generate_fallback_flashcards(paper_title: str, num_flashcards: int) -> List[Flashcard]:
    """Generate basic fallback flashcards if AI generation fails."""
    sections = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
    flashcards = []
    
    for i in range(num_flashcards):
        section = sections[i % len(sections)]
        flashcards.append(Flashcard(
            id=i+1,
            key_point=f"Key concept from the {section} of: {paper_title}",
            question=f"What is the main contribution discussed in the {section} section?",
            image_url=generate_science_image_url(paper_title)
        ))
    
    return flashcards

# Legacy function for backward compatibility
def generate_flashcards(paper_text: str, num_flashcards: int = 10) -> List[Flashcard]:
    """Legacy function - use generate_flashcards_from_paper instead."""
    return generate_fallback_flashcards("Research Paper", num_flashcards)
