from __future__ import annotations

import json
import logging
import re

from google import genai
from google.genai import types

log = logging.getLogger(__name__)


MODEL = "gemini-2.5-flash"


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



_PERSONA = """You are a senior analyst writing a decision-grade business brief for a
board of directors. Your audience is sharp: VCs, corp-dev, and CTOs who
will actually act on what you write. They will lose respect for
boilerplate. Write like someone who has read the paper, searched the
market, and has an opinion."""


_GROUNDING_INSTRUCTIONS = """You have Google Search available as a tool. USE IT. Before drafting any
section, run searches to gather real market and industry context:
  - Market size / TAM for the domain this paper targets
  - Direct competitors and comparable startups (name them specifically)
  - Recent deployments, incidents, or news (within the last 12 months)
  - Regulatory landscape (specific acts, FTC/EU decisions, compliance regimes)
  - Academic or patent prior art that this work builds on or competes with
If a search returns nothing relevant, say "insufficient public data"
in the brief. Never invent a number, company, or date. If you can't
find it, say so."""


_STYLE_RULES = """STYLE REQUIREMENTS (enforced):
1. Write prose, not bullet-list soup. Bullets are only acceptable for
   genuine enumerations of four or more parallel items. Prefer paragraphs
   with analytical flow.
2. Name specific companies, products, papers, or incidents. NEVER write
   "industry players", "various competitors", "several firms", or any
   variant. If you can't name them, say "No direct commercial
   competitors identified in public sources."
3. Every quantitative claim (TAM, growth rate, price, count) must come
   from a Google Search result you actually retrieved. If you cannot
   ground a number, omit it — don't invent "~$X billion" estimates.
4. Do not use the following phrases. If you catch yourself typing one,
   stop and rewrite:
     - "leverage synergies"
     - "paradigm shift"
     - "cutting-edge"
     - "revolutionary"
     - "game-changing"
     - "at scale"  (unless you mean a specific scale you just named)
     - "best-in-class"
     - "drive value"
     - "enable stakeholders"
5. Take a position. The Executive Summary should open with a thesis a
   reader can agree or disagree with, not a topic description. Then the
   body should defend that thesis.
6. Every section must pass the "so what" test. If removing a sentence
   doesn't change a decision a reader could make, delete it."""


_OUTPUT_SCHEMA = """OUTPUT FORMAT (strict):
Return ONLY a JSON object with exactly these eight keys:
  "Executive Summary"
  "Business Problem Addressed"
  "Technical Innovation Summary"
  "Business Impact"
  "Commercial Applications"
  "Implementation Considerations"
  "Risks and Limitations"
  "Strategic Recommendations"
Each value is a string containing the full section as plain prose. No
markdown fences, no code blocks, no extra keys, no commentary around the
JSON. Plain-text bullet character "\u2022 " is fine inside a value when
you genuinely need bullets (rule 1)."""


_PROMPT_TEMPLATE = (
    _PERSONA
    + "\n\n"
    + _GROUNDING_INSTRUCTIONS
    + "\n\n"
    + _STYLE_RULES
    + "\n\n"
    + _OUTPUT_SCHEMA
    + "\n\nResearch paper content follows. Read it carefully before searching.\n\n---\n{input_text}\n---\n\nReturn ONLY the JSON object."
)


def generate_business_brief_v2(api_key: str, input_text: str) -> dict[str, str]:
    client = genai.Client(api_key=api_key)

    prompt = _PROMPT_TEMPLATE.format(input_text=input_text)

    log.info("business-brief v2: calling %s with grounding", MODEL)
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            thinking_config=types.ThinkingConfig(thinking_budget=-1),
            temperature=0.6,
        ),
    )

    text = (response.text or "").strip()
    log.info("business-brief v2: raw output length=%d", len(text))

    sections = _parse_sections_json(text)
    log.info("business-brief v2: parsed %d sections", len(sections))
    return sections


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_sections_json(raw: str) -> dict[str, str]:
    """Pull the JSON object out of the response and validate the 8 keys.
    Defensive against code fences and preamble text even though the prompt
    forbids them — the pro model is better behaved than flash but still
    slips occasionally.
    """
    # Strip ``` / ```json fences if present.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()

    # If there's preamble, grab the outermost JSON object.
    if not raw.startswith("{"):
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            raw = m.group(0)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"v2: Gemini returned invalid JSON.\nError: {e}\nRaw output:\n{raw[:2000]}"
        )

    if not isinstance(parsed, dict):
        raise ValueError(f"v2: expected JSON object, got {type(parsed).__name__}")

    validated: dict[str, str] = {}
    for section in BUSINESS_BRIEF_SECTIONS:
        value = parsed.get(section, "")
        if not isinstance(value, str):
            value = str(value) if value is not None else ""
        value = value.strip()
        if not value:
            # Keep the same placeholder phrasing as v1 so UI doesn't branch.
            value = f"Content for {section} needs to be added."
        validated[section] = value
    return validated


