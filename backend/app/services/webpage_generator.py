import json
import os
import random
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple
import logging

import google.generativeai as genai

from app.services.script_generator import extract_text_from_file, clean_text
from app.utils.timing import track_performance

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = Path(__file__).resolve().parents[3]

MAX_TEXT_CHARS = 12000
MAX_IMAGES = 6

STYLE_PROFILES = [
    {
        "name": "Aurora Lab",
        "palette": "slate + emerald + cyan gradients with deep shadows",
        "layout": "split hero with sticky side meta rail and figure showcase",
        "mood": "clean, futuristic, data-forward, cutting-edge",
    },
    {
        "name": "Paper Atlas", 
        "palette": "stone + amber + navy with warm undertones",
        "layout": "editorial with wide typographic sections and full-width gallery",
        "mood": "academic, warm, trustworthy, scholarly",
    },
    {
        "name": "Signal Grid",
        "palette": "zinc + rose + indigo with bold accents",
        "layout": "modular card grid with metric band and figure cards",
        "mood": "technical, punchy, modern, engineering-focused",
    },
    {
        "name": "Monograph",
        "palette": "neutral + sky + lime with minimal contrast",
        "layout": "single-column narrative with visual callouts and embedded figures",
        "mood": "minimal, readable, calm, timeless",
    },
    {
        "name": "Research Bloom",
        "palette": "gray + teal + orange with vibrant accents",
        "layout": "gallery-first with abstract and contribution chips plus feature cards",
        "mood": "bold, visual, explanatory, inspiring",
    },
]


@track_performance
def _paper_text_from_info(paper_info: Dict) -> str:
    text_path_raw = paper_info.get("text_file_path") or paper_info.get("tex_file_path")
    text_path = _resolve_existing_path(text_path_raw)
    if not text_path:
        return ""

    text = extract_text_from_file(str(text_path))
    text = clean_text(text or "")
    return text[:MAX_TEXT_CHARS]


@track_performance
def _resolve_existing_path(raw_path: str | None) -> Path | None:
    if not raw_path:
        return None

    p = Path(raw_path)
    candidates: List[Path] = [p]

    # Paths in storage can be relative to backend or repo root.
    candidates.append(BACKEND_DIR / p)
    candidates.append(REPO_DIR / p)

    if raw_path.startswith("backend/"):
        tail = Path(raw_path[len("backend/"):])
        candidates.append(BACKEND_DIR / tail)

    for cand in candidates:
        if cand.exists():
            return cand
    return None


@track_performance
def _image_urls(paper_id: str, paper_info: Dict) -> List[str]:
    out: List[str] = []
    for image_path in paper_info.get("image_files", [])[:MAX_IMAGES]:
        resolved = _resolve_existing_path(image_path)
        if resolved:
            out.append(f"/api/webpage/{paper_id}/asset/{resolved.name}")
    return out


@track_performance
def _random_profile(used_names: set[str] | None = None) -> Dict:
    used_names = used_names or set()
    available = [p for p in STYLE_PROFILES if p["name"] not in used_names]
    if not available:
        available = STYLE_PROFILES
    return random.SystemRandom().choice(available)


@track_performance
def _extract_resource_links(text: str) -> List[str]:
    if not text:
        return []

    pattern = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)?(?:/[A-Za-z0-9._-]+)?", re.IGNORECASE)
    links: List[str] = []
    for match in pattern.findall(text):
        cleaned = match.rstrip(".,;:)\"]'\"")
        if not cleaned.startswith("http"):
            cleaned = f"https://{cleaned}"
        if cleaned not in links:
            links.append(cleaned)
    return links


@track_performance
def _build_prompt(title: str, authors: str, text: str, links: List[str], image_urls: List[str], profile: Dict) -> str:
    """Build prompt for Gemini to generate webpage HTML."""
    figures_instruction = (
        "No figure URLs available. Omit the figures section cleanly."
        if not image_urls
        else "Use every figure URL exactly once in the figures/gallery section. Do not use placeholder image URLs."
    )

    return f"""You are an award-winning web designer and technical writer.
Create ONE adaptive, presentation-ready research landing page as a single self-contained HTML document.

CRITICAL REQUIREMENTS:
1. Return ONLY the HTML code - no markdown, no code fences, no explanation
2. Start with <!DOCTYPE html> and end properly with </html>
3. Use Tailwind CSS from CDN: https://cdn.tailwindcss.com
4. Make it BEAUTIFUL and presentation-ready (like a polished product landing page)
5. Primary goal: communicate the paper's key highlights in short, crisp, visually clear form
6. Do NOT force a fixed template. Infer the best page structure from the paper type, title, figures, and content.
7. Responsive: Works perfectly on mobile and desktop
8. Fast: no heavy JS, minimal inline CSS
9. Use ONLY source material from paper content. No hallucinated claims.
10. Never use placeholders like via.placeholder.com.

STYLE PROFILE (use this for inspiration, adapt creatively):
- Name: {profile['name']}
- Colors: {profile['palette']}
- Layout: {profile['layout']}
- Mood: {profile['mood']}

VISUAL DIRECTION:
- Choose a dominant background and one strong accent color, then use 1-2 supporting accents only.
- Keep contrast deliberate: dark text on light surfaces or light text on dark surfaces, never muddy mid-tone blocks.
- Use generous whitespace, clear section spacing, and well-defined card boundaries.
- Make figures feel like first-class content with frame, caption, and context.
- Prefer a sharp editorial look over decorative clutter.
- Keep the hero bold, the highlights compact, and the repository link clearly visible.

LAYOUT DIRECTION:
- Decide the best structure from the paper itself.
- If it is experimental or benchmark-heavy, prioritize key findings, metrics, and figures.
- If it is method-heavy, prioritize a compact methodology or pipeline section.
- If it is survey or conceptual, prioritize themes, sections, and takeaways.
- Keep the page focused on what would help a reader understand the paper quickly and visually.

PAPER DETAILS:
Title: {title}
Authors: {authors}

CONTENT TO INCLUDE (base your content on this):
{text}

FIGURE URLS (local project assets):
{json.dumps(image_urls)}
FIGURE RULE:
{figures_instruction}

RESOURCES (if available):
{json.dumps(links)}

BEST PRACTICES:
- Keep text concise: favor highlight cards/bullets over long blocks
- Add meaningful section headings and concise, crisp summaries
- Display figures prominently and give each a short caption inferred from nearby paper context
- Use nice typography with Google Fonts
- Add subtle gradients and shadows for depth
- Create visual hierarchy with sizes and colors
- Use cards and sections with breathing room
- If there's a GitHub link, make it a prominent CTA button with an icon
- Show key metrics/findings as visual callouts
- Make it feel premium and polished, not generic
- If the paper has only a few strong claims, prioritize those instead of stretching the content.

Write clean, semantic HTML with Tailwind classes only. No JavaScript needed."""


@track_performance
def _build_repair_prompt(original_html: str, issues: List[str], image_urls: List[str], links: List[str]) -> str:
    return f"""Fix the following HTML page by editing it and returning full corrected HTML only.

Issues to fix:
{json.dumps(issues)}

Mandatory constraints:
- Keep the visual quality high.
- Keep a complete valid HTML document with <!DOCTYPE html>.
- Do not use placeholder image URLs.
- If image URLs are provided, include them in <img src="..."> tags in a visible figure/gallery section.
- Use only these figure URLs: {json.dumps(image_urls)}
- Use only these resource links: {json.dumps(links)}

Original HTML:
{original_html}
"""


@track_performance
def _validate_generated_html(html: str, image_urls: List[str], links: List[str]) -> List[str]:
    issues: List[str] = []
    lower = html.lower()

    if "<!doctype" not in lower:
        issues.append("Missing doctype")
    if "via.placeholder" in lower or "placeholder.com" in lower:
        issues.append("Contains placeholder image URLs")

    if image_urls:
        if "<img" not in lower:
            issues.append("No image tags found despite figure URLs being available")
        for url in image_urls:
            occurrences = html.count(url)
            if occurrences == 0:
                issues.append(f"Missing required figure URL: {url}")
            elif occurrences > 1:
                issues.append(f"Figure URL appears more than once: {url}")

    if links:
        has_resource = any(link in html for link in links)
        if not has_resource:
            issues.append("No provided resource links found in HTML")

    return issues


@track_performance
def _replace_placeholder_images(html: str, image_urls: List[str]) -> str:
    if not image_urls:
        return html

    placeholder_pattern = re.compile(
        r'(<img[^>]*src=["\'])(https?://[^"\']*(?:via\.placeholder\.com|placeholder\.com)[^"\']*)(["\'][^>]*>)',
        re.IGNORECASE,
    )
    idx = 0

    def repl(match):
        nonlocal idx
        replacement = image_urls[idx % len(image_urls)]
        idx += 1
        return f"{match.group(1)}{replacement}{match.group(3)}"

    return placeholder_pattern.sub(repl, html)


@track_performance
def _generate_with_gemini(prompt: str, api_key: str) -> str:
    """Generate HTML content using Gemini API."""
    genai.configure(api_key=api_key)
    models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]

    last_error: Exception | None = None
    for model_name in models:
        try:
            model = genai.GenerativeModel(
                model_name,
                generation_config={
                    "temperature": 1.0,
                    "max_output_tokens": 16000,
                }
            )
            response = model.generate_content(prompt, stream=False)
            html = (response.text or "").strip()
            
            if html and html.lower().startswith("<!doctype"):
                return html
            elif html:
                # Might be wrapped or have prefix
                return html
                
        except Exception as exc:
            last_error = exc
            logger.debug(f"Model {model_name} failed: {exc}")
            continue

    if last_error:
        raise RuntimeError(f"All Gemini models failed: {last_error}")
    raise RuntimeError("No valid response from Gemini models")


@track_performance
def _normalize_html(html: str) -> str:
    cleaned = (html or "").strip()
    if cleaned.startswith("```html"):
        cleaned = cleaned[7:].strip()
    if cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()
    if not cleaned.lower().startswith("<!doctype"):
        cleaned = "<!DOCTYPE html>\n" + cleaned
    return cleaned


@track_performance
def _variant_dir(paper_id: str) -> Path:
    path = Path(f"temp/webpages/{paper_id}")
    path.mkdir(parents=True, exist_ok=True)
    return path


@track_performance
def _read_manifest(paper_id: str) -> Dict:
    mpath = _variant_dir(paper_id) / "manifest.json"
    if not mpath.exists():
        return {"paper_id": paper_id, "variants": []}
    try:
        return json.loads(mpath.read_text(encoding="utf-8"))
    except Exception:
        return {"paper_id": paper_id, "variants": []}


@track_performance
def _write_manifest(paper_id: str, manifest: Dict):
    mpath = _variant_dir(paper_id) / "manifest.json"
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


@track_performance
def generate_variant(
    paper_id: str,
    user_id: str,
    paper_info: Dict,
    api_key: str,
    variant_index: int,
    profile_override: Dict | None = None,
) -> Tuple[str, Dict]:
    """Generate a webpage variant using Gemini-only adaptive prompting."""
    metadata = paper_info.get("metadata", {})
    title = metadata.get("title", "Research Project")
    authors = metadata.get("authors", "Authors")
    text = _paper_text_from_info(paper_info)
    links = _extract_resource_links(text)
    image_urls = _image_urls(paper_id, paper_info)

    profile = profile_override or _random_profile()
    prompt = _build_prompt(title, authors, text, links, image_urls, profile)

    html = _normalize_html(_generate_with_gemini(prompt, api_key))
    issues = _validate_generated_html(html, image_urls, links)

    if issues:
        repair_prompt = _build_repair_prompt(html, issues, image_urls, links)
        html = _normalize_html(_generate_with_gemini(repair_prompt, api_key))
        html = _replace_placeholder_images(html, image_urls)
        issues = _validate_generated_html(html, image_urls, links)

    if issues:
        raise RuntimeError(f"Generated HTML did not pass quality checks: {issues}")

    # Save the HTML
    variant_id = f"v{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{uuid.uuid4().hex[:8]}"
    vpath = _variant_dir(paper_id) / f"{variant_id}.html"
    vpath.write_text(html, encoding="utf-8")

    return variant_id, {
        "variant_id": variant_id,
        "theme": profile["name"],
        "created_at": datetime.utcnow().isoformat() + "Z",
        "file": str(vpath),
    }


@track_performance
def save_variant_meta(paper_id: str, variant_meta: Dict):
    manifest = _read_manifest(paper_id)
    variants = manifest.get("variants", [])
    variants.insert(0, variant_meta)
    manifest["variants"] = variants[:1]
    _write_manifest(paper_id, manifest)


@track_performance
def clear_variants(paper_id: str):
    vdir = _variant_dir(paper_id)
    for html_file in vdir.glob("*.html"):
        try:
            html_file.unlink()
        except Exception as exc:
            logger.warning(f"Failed to delete old variant {html_file}: {exc}")

    _write_manifest(paper_id, {"paper_id": paper_id, "variants": []})


@track_performance
def list_variants(paper_id: str) -> List[Dict]:
    return _read_manifest(paper_id).get("variants", [])
