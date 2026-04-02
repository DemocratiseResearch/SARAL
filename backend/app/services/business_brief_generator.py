import google.generativeai as genai
import json
import re
import logging
from app.utils.timing import track_performance

logger = logging.getLogger(__name__)

BUSINESS_BRIEF_SECTIONS = [
    "Executive Summary",
    "Business Problem Addressed",
    "Technical Innovation Summary",
    "Business Impact",
    "Commercial Applications",
    "Implementation Considerations",
    "Risks and Limitations",
    "Strategic Recommendations",
]

BUSINESS_BRIEF_PROMPT = """Act as a business strategist and technical analyst.
Convert the following research paper into a structured business brief for executives and decision-makers.
The business brief must include:
1. Executive Summary (non-technical)

2. Business Problem Addressed

3. Technical Innovation Summary (simplified)

4. Business Impact

5. Commercial Applications

6. Implementation Considerations

7. Risks and Limitations

8. Strategic Recommendations

Ensure the explanation is business-focused, avoids unnecessary academic jargon, and clearly connects the research to revenue, cost, efficiency, scalability, or competitive advantage.

CRITICAL RULES:
- You MUST return ONLY valid JSON, no markdown, no code fences, no extra text.
- The JSON object must have EXACTLY these keys:
  "Executive Summary", "Business Problem Addressed", "Technical Innovation Summary",
  "Business Impact", "Commercial Applications", "Implementation Considerations",
  "Risks and Limitations", "Strategic Recommendations"
- Each value must be a string containing the full content for that section.
- Use plain text only. No markdown formatting inside values.
- For sections that benefit from bullet points, use the bullet character "•" followed by a space to start each point, and separate points with newline characters within the string.

Research paper content:
{input_text}

Return ONLY the JSON object."""


@track_performance
def generate_business_brief_with_gemini(api_key: str, input_text: str) -> dict:
    """Generate a structured business brief from paper content using Gemini."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = BUSINESS_BRIEF_PROMPT.format(input_text=input_text)

    logger.info("Sending business brief generation request to Gemini...")
    response = model.generate_content(prompt)
    raw_text = response.text.strip()

    logger.info(f"Gemini raw output length: {len(raw_text)} chars")
    logger.debug(f"Gemini raw output preview: {raw_text[:300]}")

    try:
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```[a-zA-Z]*\n?", "", raw_text)
            raw_text = re.sub(r"\n?```$", "", raw_text)

        sections = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Gemini returned invalid JSON after cleaning.\nError: {e}\nOutput:\n{raw_text}"
        )

    # Validate and fill missing sections
    validated = {}
    for section_name in BUSINESS_BRIEF_SECTIONS:
        content = sections.get(section_name, "").strip()
        if not content:
            content = f"Content for {section_name} needs to be added."
        validated[section_name] = content

    logger.info(f"Successfully generated business brief with {len(validated)} sections")
    return validated
