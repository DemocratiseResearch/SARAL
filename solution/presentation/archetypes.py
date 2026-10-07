"""Slide archetype definitions and classification for academic research presentations.

Archetypes translate research narrative semantics into visual layouts:
- Problem & Motivation
- Research Question & Hypothesis
- Methodology & Workflow Pipeline
- Results & Empirical Evidence (with or without figures)
- Comparative Analysis
- Key Findings & Discussion
- Limitations & Future Work
- Conclusion & Defense Verdict
- General Structured Cards
"""

from __future__ import annotations

import enum
import re
from typing import List


class SlideArchetype(enum.Enum):
    """Semantic category of a presentation slide."""
    TITLE = "title"
    PROBLEM = "problem"
    QUESTION = "question"
    METHODOLOGY = "methodology"
    RESULTS = "results"
    COMPARISON = "comparison"
    FINDINGS = "findings"
    LIMITATIONS = "limitations"
    CONCLUSION = "conclusion"
    GENERAL = "general"


# Keyword mapping to detect archetype from section title.
# Order matters: more specific patterns (e.g. COMPARISON, LIMITATIONS, QUESTION) are checked before generic ones (RESULTS, CONCLUSION).
_ARCHETYPE_PRIORITY_ORDER = [
    (
        SlideArchetype.QUESTION,
        re.compile(r"\b(questions?|hypothes[ie]s|objectives?|goals?|aims?|thesis|statements?)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.COMPARISON,
        re.compile(r"\b(comparisons?|comparative|baselines?|versus|vs\.?|trade-?offs?|prior\s+works?|benchmark\s+comparisons?)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.LIMITATIONS,
        re.compile(r"\b(limitations?|threats?|risks?|failure\s+modes?|scope|constraints?|ethical|delimitations?)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.PROBLEM,
        re.compile(r"\b(problems?|motivations?|challenges?|contexts?|backgrounds?|knowledge\s+gap|deficienc(?:y|ies))\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.CONCLUSION,
        re.compile(r"\b(conclusions?|summar(?:y|ies)|concluding|takeaways?|verdicts?|future\s+work|future\s+directions?|closings?)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.METHODOLOGY,
        re.compile(r"\b(methods?|methodolog(?:y|ies)|approachs?|architectures?|workflows?|pipelines?|frameworks?|algorithms?|models?|systems?|designs?|setups?|protocols?)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.RESULTS,
        re.compile(r"\b(results?|evaluations?|performance|experiments?|benchmarks?|empirical|accurac(?:y|ies)|ablations?|metrics?|findings?\s+and\s+data)\b", re.IGNORECASE),
    ),
    (
        SlideArchetype.FINDINGS,
        re.compile(r"\b(findings?|discover(?:y|ies)|insights?|discussions?|implications?|impacts?|contributions?)\b", re.IGNORECASE),
    ),
]


def classify_slide(
    title: str,
    bullets: List[str],
    has_image: bool = False,
    section_index: int = 0,
    total_sections: int = 1,
) -> SlideArchetype:
    """Determine the most fitting visual archetype for a given slide."""
    # Check title keywords first in priority order
    for archetype, pattern in _ARCHETYPE_PRIORITY_ORDER:
        if pattern.search(title):
            return archetype

    # If title is generic (e.g. "Section 1"), check bullet content
    all_bullet_text = " ".join(bullets)
    for archetype, pattern in _ARCHETYPE_PRIORITY_ORDER:
        if pattern.search(all_bullet_text):
            return archetype

    # Position-based heuristics when title is neutral:
    # First section often introduces problem / context
    if section_index == 0 and total_sections >= 3:
        return SlideArchetype.PROBLEM

    # Last section often concludes
    if section_index == total_sections - 1 and total_sections >= 3:
        return SlideArchetype.CONCLUSION

    # Has an assigned scientific image? Treat as results / architecture
    if has_image:
        return SlideArchetype.RESULTS

    return SlideArchetype.GENERAL
