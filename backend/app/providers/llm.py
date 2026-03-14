"""
Model-agnostic LLM module powered by LiteLLM.

Supports any provider — OpenAI, Gemini, Anthropic, Groq, Ollama, Mistral, etc.
The user sets LLM_MODEL (e.g. "gemini/gemini-2.0-flash") and the corresponding
API key env var. LiteLLM resolves the rest.

See https://docs.litellm.ai/docs/providers for the full list.
"""

import re
import logging
import json
import litellm

logger = logging.getLogger(__name__)

# Suppress litellm's noisy default logging
litellm.suppress_debug_info = True

SCRIPT_PROMPT = """Create a script for a 3-5 minute educational video based on this research paper.
STRUCTURE:
Create scripts for exactly these sections, in the order listed:
{sections_list}

Each section MUST start with its exact heading as shown above (wrapped in ** markers).
Important rules:
1. Each section MUST start with its exact heading as shown above
2. Keep content clear and focused - about 2-3 paragraphs per section
3. Focus on explaining the research in simple terms
4. Avoid technical jargon where possible
5. Make it engaging for a general audience
6. DO NOT include any video/animation directions or [Narrator:] tags
7. Do not use contracted words (e.g. we'll → we will, we're → we are)

Research Paper Content:
{paper_text}

Generate the complete presentation script with clear section headers:"""

BULLETS_PROMPT = """You are a research summarization assistant helping to create presentation-ready slide bullet points from academic paper sections.

TASK: For each section provided, generate 3–5 concise, informative bullet points summarizing its key content.

BULLET POINT GUIDELINES:
• Each bullet must express one clear, complete idea
• Use action-oriented and parallel sentence structures within each section
• Avoid vague terms, sub-bullets, or complex phrasing
• Limit each bullet to 1–2 lines max
• Focus on the most important findings, methods, or conclusions

INPUT: {sections_text}

OUTPUT FORMAT (strictly follow this layout):

[SECTION_NAME]
• Bullet point 1
• Bullet point 2
• Bullet point 3
• Bullet point 4 (if applicable)
• Bullet point 5 (if applicable)

Process all sections in the input and generate bullet points accordingly."""

METADATA_PROMPT = """You are a research assistant tasked with extracting standardized metadata from a research paper's text.
Given the text of an academic paper (extracted from PDF or LaTeX), identify and extract the following:
1. Title (The full, correct title of the research paper)
2. Authors (A list of all authors, formatted as a single comma-separated string)
3. Date/Year (The publication date or year, e.g., "2024" or "September 2023")

Important Rules:
- If the title is split across lines, join it cleanly into one line.
- Do not include journal names, footers, or "Submitted to..." as part of the title.
- Extract ONLY the metadata requested.
- Return ONLY a valid JSON object.

Example Output:
{{
  "title": "Quantum Supremacy using a Programmable Superconducting Processor",
  "authors": "Frank Arute, Kunal Arya, Ryan Babbush",
  "date": "2019"
}}

Research Paper Text:
{paper_text}"""


def _chat(model: str, prompt: str, api_key: str | None = None) -> str:
    """Single LLM call via LiteLLM. Works with any supported provider."""
    response = litellm.completion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        api_key=api_key,
    )
    return response.choices[0].message.content or ""


def generate_script(paper_text: str, sections: list[str], model: str, api_key: str | None = None) -> str:
    """Generate a presentation script from paper text for the given sections."""
    sections_list = "\n".join(f"**{s}**" for s in sections)
    prompt = SCRIPT_PROMPT.format(paper_text=paper_text, sections_list=sections_list)
    return _chat(model, prompt, api_key)


def generate_bullet_points(
    sections_scripts: dict[str, str],
    model: str,
    api_key: str | None = None,
) -> dict[str, list[str]]:
    """Generate 3-5 bullet points per section."""
    sections_text = ""
    for name, text in sections_scripts.items():
        if text and text.strip():
            sections_text += f"\n## {name}\n{text}\n"

    raw = _chat(model, BULLETS_PROMPT.format(sections_text=sections_text), api_key)
    return _parse_bullet_response(raw, sections_scripts)


def _parse_bullet_response(
    text: str, sections_scripts: dict[str, str]
) -> dict[str, list[str]]:
    """Parse LLM bullet-point response into a dict."""
    result: dict[str, list[str]] = {}
    current_section = None

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # Detect section headers in various formats
        section_name = None
        if line.startswith("[") and line.endswith("]"):
            section_name = line[1:-1].strip()
        elif line.startswith("**") and line.endswith("**"):
            section_name = line[2:-2].strip()
        elif line.startswith("##"):
            section_name = line.lstrip("#").strip()

        if section_name:
            for std_name in sections_scripts:
                if (
                    std_name.lower() in section_name.lower()
                    or section_name.lower() in std_name.lower()
                ):
                    current_section = std_name
                    result[current_section] = []
                    break
        elif current_section and re.match(r"^[•\-*·]", line):
            bullet = re.sub(r"^[•\-*·]\s*", "", line).strip()
            if bullet:
                result[current_section].append(bullet)

    # Fallback for any section that got no bullets
    for name, text in sections_scripts.items():
        if name not in result or not result[name]:
            sentences = [
                s.strip() for s in text.split(".") if s.strip() and len(s.strip()) > 10
            ]
            result[name] = sentences[:4] if sentences else [
                "Key information from this section"
            ]
        result[name] = result[name][:5]

    return result


def extract_paper_metadata(
    paper_text: str, model: str, api_key: str | None = None
) -> dict:
    """Extract metadata (title, authors, date) from paper text using LLM."""
    try:
        # Use first 6000 chars roughly to capture title/authors/date
        snippet = paper_text[:6000]
        raw = _chat(model, METADATA_PROMPT.format(paper_text=snippet), api_key)

        # Find JSON block if LLM was verbose
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
        else:
            data = json.loads(raw)

        return {
            "title": data.get("title", "Untitled").strip(),
            "authors": data.get("authors", "Unknown").strip(),
            "date": str(data.get("date", "")).strip(),
        }
    except Exception as e:
        logger.warning(f"Metadata extraction failed (LLM offline or quota hit): {e}")
        return {"title": "Untitled", "authors": "Unknown", "date": ""}
