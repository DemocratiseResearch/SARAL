import google.generativeai as genai
import re
import unicodedata
from typing import Dict, List
from app.utils.timing import track_performance

PATENT_AUDIENCE_PROMPTS = {
    "novice": (
        "Generate a 5-slide presentation content to be used for narration for a novice audience regarding the topic of this paper."
        "Slide 1: Introduction. Focus on the 'Why.' Use an 'Action Headline' and one relatable 'Did You Know?' statistic to anchor the problem."
        "Slide 2: Methodology. Explain the process using a single, clear analogy. Suggest a simple visual metaphor for the slide."
        "Slide 3: Results. Highlight the 'Big Win.' Use high-level outcomes and avoid dense data tables. Focus on the most significant change or discovery."
        "Slide 4: Discussion. Explain how this fits into the world today. Use jargon-free language to explain the importance of these results."
        "Slide 5: Conclusion. The 'Everyday Impact.' End with exactly how this research will change the user's daily life in the next 5 years."
    ),
    "intermediate": (
        "Generate a 5-slide presentation content to be used for narration for professionals in the field of this paper."
        "Slide 1: Introduction. Define the industry problem and the specific value proposition of this research. Use metrics-driven headlines."
        "Slide 2: Methodology. Detail the specific workflow or pipeline. Use an 'Executive Pillar' format (3-4 key phases) to show the logic."
        "Slide 3: Results. Present data using KPIs and performance benchmarks. Suggest a specific chart type (e.g., bar chart or heatmap) to visualize the findings."
        "Slide 4: Discussion. Explain how these results align with or disrupt current industry trends. Include a brief 'Moat' or 'Competitive Advantage' analysis."
        "Slide 5: Conclusion. Focus on scalability and implementation. What are the logical next steps for a professional team?"
    ),
    "expert": (
        "Generate a 5-slide technical presentation content to be used for narration for a peer-expert audience regarding the topic of this paper."
        "Slide 1: Introduction. State the theoretical gap, research hypothesis, and baseline assumptions. Use precise terminology."
        "Slide 2: Methodology. Detail the mathematical framework. Use LaTeX ($...$) for governing equations. Include a 'Technical Specifications' table for variables, controls, and error bounds."
        "Slide 3: Results. Focus on statistical significance, convergence rates, or $L_2$ error analysis. Provide a high-density data summary."
        "Slide 4: Discussion. Analyze the theoretical implications. How does this challenge existing models or contribute to the 'Future Research Frontier'?"
        "Slide 5: Conclusion. Summarize the core contribution to the field and outline 2-3 specific directions for high-level future research."
    ),
}


PATENT_AUDIENCE_PROMPTS_BULLETS = {
    "novice": (
        "Constraints: Apply the 6x6 Rule (max 6 words per line, 6 lines per slide).Provide the bullet points in an engaging, storytelling tone."
    ),
    "intermediate": (
        "Constraints: Use punchy, authoritative fragments. No full sentences on slides. Provide the bullet points containing industry-specific context."
    ),
    "expert": (
        "Constraints: Prioritize data integrity and objective tone. Ensure all LaTeX is formatted for high-resolution display.Provide the bullet points in a way that is easy to understand for a peer-expert audience."
    ),
}

@track_performance
def extract_patent_metadata(file_path: str) -> Dict[str, str]:
    """Extract patent metadata from a text file (converted from PDF)."""
    metadata = {
        "title": "Invention Title",
        "patent_id": "Not Found",
        "inventors": "Inventor(s)",
        "assignee": "Assignee",
        "publication_date": "Date"
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Try to find title
        title_match = re.search(r'^(?:Title|Invention Title):\s*(.*)', content, re.IGNORECASE | re.MULTILINE)
        if title_match:
            metadata["title"] = title_match.group(1).strip()
        else:
            # Fallback: Use the first non-empty line as title
            for line in content.split('\n')[:10]:
                if line.strip() and len(line.strip()) > 10:
                    metadata["title"] = line.strip()
                    break
        
        # Try to find patent id
        patent_id_match = re.search(r'^(?:Patent No\.?|Patent Number|Publication Number|Document number):\s*([\w\d,\s/]+)', content, re.IGNORECASE | re.MULTILINE)
        if patent_id_match:
            metadata["patent_id"] = patent_id_match.group(1).strip()

        # Try to find inventors
        inventors_match = re.search(r'^Inventor(?:s)?:\s*(.*)', content, re.IGNORECASE | re.MULTILINE)
        if inventors_match:
            metadata["inventors"] = inventors_match.group(1).strip()

        # Try to find assignee
        assignee_match = re.search(r'^Assignee:\s*(.*)', content, re.IGNORECASE | re.MULTILINE)
        if assignee_match:
            metadata["assignee"] = assignee_match.group(1).strip()

        # Try to find publication date
        date_match = re.search(r'^(?:Publication Date|Date of Patent):\s*(.*)', content, re.IGNORECASE | re.MULTILINE)
        if date_match:
            metadata["publication_date"] = date_match.group(1).strip()

    except Exception as e:
        print(f"Error extracting metadata from patent text file: {e}")

    return metadata

@track_performance
def extract_text_from_file(file_path: str) -> str:
    """Extract clean text from a patent text file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Basic cleaning for text extracted from PDFs
        content = re.sub(r'\s*\n\s*', '\n', content) # Consolidate newlines
        return content.strip()
    except Exception as e:
        print(f"Error extracting text from file: {e}")
        return ""

@track_performance
def clean_text(text: str) -> str:
    """Clean unicode characters from text."""
    # Replace common unicode quotes and dashes
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('‘', "'").replace('’', "'")
    text = text.replace('–', '-').replace('—', '-')
    text = unicodedata.normalize('NFKD', text)
    return text

@track_performance
def generate_patent_script_with_gemini(api_key: str, input_text: str, audience_level: str = None) -> str:
    """Generate a presentation script for a patent using the Gemini API."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')

    # Build audience context if provided
    audience_context = ""
    if audience_level and audience_level.lower() in PATENT_AUDIENCE_PROMPTS:
        audience_context = PATENT_AUDIENCE_PROMPTS[audience_level.lower()]

    prompt = f"""
Create a script for a 3-5 minute educational video explaining an invention based on this patent document.

STRUCTURE:
Create scripts for exactly these 6 sections:
**Potential Applications**: A list of atleast four potential applications where the invention could be applied, along with a one-line description about the application.
**Introduction**: A brief overview of the invention and its purpose.
**Background**: Describe the field of invention and the problems with existing solutions (prior art).
**Invention Description**: Explain the core components and workings of the invention in detail.
**Claims and applications**: Summarize the key claims in simple terms and discuss potential real-world applications.
**Conclusion**: Briefly recap the invention's significance and its main advantages.

IMPORTANT RULES:
1.  Each section MUST start with its exact heading as shown above (e.g., **Introduction**).
2.  Keep the content clear and focused, aiming for 2-3 paragraphs per section.
3.  Focus on explaining the invention in simple, accessible terms.
4.  Avoid overly technical jargon and legalistic language where possible.
5.  Make it engaging for an audience of engineers, students, or potential investors.
6.  DO NOT include any video/animation directions or narrator tags.
7.  Write out all words fully; do not use contractions (e.g., use "it is" instead of "it's").

Here is the patent text to base the script on:
PATENT CONTENT:
{input_text}
{audience_context}
Please generate the complete presentation script with the specified section headers:
"""

    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error generating script with Gemini: {e}")
        raise

@track_performance
def generate_all_bullet_points_with_gemini(api_key: str, sections_scripts: Dict[str, str], audience_level: str = None) -> Dict[str, List[str]]:
    """Generate bullet points for all patent sections using a single, optimized prompt."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')
    
    # Build audience context for bullet points
    audience_context = ""
    if audience_level and audience_level.lower() in PATENT_AUDIENCE_PROMPTS_BULLETS:
        audience_context = PATENT_AUDIENCE_PROMPTS[audience_level.lower()]
    
    sections_text = ""
    for section_name, script_text in sections_scripts.items():
        if script_text and script_text.strip():
            sections_text += f"\n## {section_name}\n{script_text}\n"

    prompt = f"""
You are an assistant who excels at summarizing patent information for presentations.
{audience_context}
TASK: For each of the following sections from a patent presentation script, generate 3–5 concise, informative bullet points for a slide.

BULLET POINT GUIDELINES:
- Each bullet must summarize a key concept, feature, or claim.
- Use clear, action-oriented language.
- Keep bullet points parallel in structure where possible.
- Avoid sub-bullets and overly complex sentences.
- Limit each bullet to 1-2 lines maximum.
- Focus on the most important technical features, advantages, or protected aspects.
- For `Potential Applications` section, do not change the text. Show applications listed in the section as bullet points.

INPUT SCRIPT SECTIONS:
{sections_text}

OUTPUT FORMAT (strictly follow this layout):

[SECTION_NAME]
• Bullet point 1
• Bullet point 2
• Bullet point 3

[NEXT_SECTION_NAME]
• Bullet point 1
• Bullet point 2
• Bullet point 3

Generate bullet points for all sections provided in the input.
"""

    try:
        response = model.generate_content(prompt)
        bullet_text = response.text.strip()
        
        sections_bullets = {}
        current_section = None
        
        for line in bullet_text.split('\n'):
            line = line.strip()
            if not line:
                continue

            if line.startswith('[') and line.endswith(']'):
                section_name = line[1:-1].strip()
                for standard_name in sections_scripts.keys():
                    if standard_name.lower() in section_name.lower():
                        current_section = standard_name
                        sections_bullets[current_section] = []
                        break
            elif current_section and (line.startswith('•') or line.startswith('-') or line.startswith('*')):
                bullet = re.sub(r'^[•\-*·]\s*', '', line).strip()
                if bullet:
                    sections_bullets[current_section].append(bullet)

        # Fallback for any sections that were missed
        for section_name, script in sections_scripts.items():
            if not sections_bullets.get(section_name):
                sentences = [s.strip() for s in script.split('.') if s.strip() and len(s.strip()) > 10]
                sections_bullets[section_name] = sentences[:4] if sentences else ["Key information from this section."]

        return sections_bullets

    except Exception as e:
        print(f"Error generating all bullet points: {e}. Using fallback.")
        # Fallback to sentence-based generation if API fails
        sections_bullets = {}
        for section_name, script_text in sections_scripts.items():
            sentences = [s.strip() for s in script_text.split('.') if s.strip() and len(s.strip()) > 10]
            sections_bullets[section_name] = sentences[:4] if sentences else ["Key information from this section."]
        return sections_bullets

@track_performance
def split_script_into_sections(full_script: str) -> Dict[str, str]:
    """Split the generated patent script into its structured sections."""
    sections = {
        "Potential Applications":"",
        "Introduction": "",
        "Background": "",
        "Invention Description": "",
        "Claims and applications": "",
        "Conclusion": ""
    }
    
    section_pattern = r"\*\*(Potential Applications|Introduction|Background|Invention Description|Claims and applications|Conclusion)\*\*"
    
    parts = re.split(section_pattern, full_script)
    
    if len(parts) > 1:
        it = iter(parts[1:]) 
        for header, content in zip(it, it):
            if header in sections:
                sections[header] = content.strip()
    
    for section_name, content in sections.items():
        if not content:
            sections[section_name] = f"Content for the '{section_name}' section could not be generated."

    return sections

@track_performance
def clean_script_for_tts_and_video(script_text: str) -> str:
    """Clean script text for TTS and video generation by removing markdown."""
    script_text = re.sub(r'\*\*([^*]+)\*\*', r'\1', script_text) 
    script_text = re.sub(r'#+\s*', '', script_text) 
    script_text = re.sub(r'[^\w\s.,!?;:\-()"]', ' ', script_text) 
    script_text = re.sub(r'\s+', ' ', script_text).strip()
    return script_text

@track_performance
def generate_patent_title_introduction(title: str, patent_id: str, inventors: str, assignee: str, publication_date: str) -> str:
    """Generate a standard introduction script for the title slide of a patent presentation."""
    
    if ',' in inventors or ' and ' in inventors:
        first_inventor = re.split(r',| and ', inventors)[0].strip()
        inventors_text = f"{first_inventor} and colleagues"
    else:
        inventors_text = inventors

    intro = f"""
Welcome to this presentation on the invention titled: {title}.
This patent, number {patent_id}, was developed by {inventors_text} and is assigned to {assignee}.
It was published on {publication_date}.
Today, we will explore the background of this invention, its detailed description, and its potential applications.
Let us begin with an introduction to the technology.
"""
    return clean_script_for_tts_and_video(intro)