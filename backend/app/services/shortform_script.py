import os
import json
import re
from pathlib import Path
from typing import Dict, List

from sarvamai import SarvamAI

try:
    import google.generativeai as genai  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    genai = None

STYLE_GUIDE_PATH = "prompts/style_guide.md"

def load_style() -> str:
    path = Path(STYLE_GUIDE_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Style guide missing at {path.resolve()}")
    return path.read_text(encoding="utf-8")

def snippets_to_context(snippets: List[Dict]) -> str:
    if not snippets:
        return "- No external snippets found. Keep claims conservative and clearly framed."
    return "\n\n".join(
        [f"- {s['title']} ({s['url']}): {s['summary']}" for s in snippets]
    )

_LANGUAGE_ALIASES = {
    "en": "en-IN",
    "english": "en-IN",
    "hi": "hi-IN",
    "hindi": "hi-IN",
    "bn": "bn-IN",
    "bengali": "bn-IN",
    "ta": "ta-IN",
    "tamil": "ta-IN",
    "te": "te-IN",
    "telugu": "te-IN",
    "kn": "kn-IN",
    "kannada": "kn-IN",
    "ml": "ml-IN",
    "malayalam": "ml-IN",
    "mr": "mr-IN",
    "marathi": "mr-IN",
    "gu": "gu-IN",
    "gujarati": "gu-IN",
    "pa": "pa-IN",
    "punjabi": "pa-IN",
    "od": "od-IN",
    "odia": "od-IN",
    "or": "od-IN",
    "as": "as-IN",
    "assamese": "as-IN",
    "ur": "ur-IN",
    "urdu": "ur-IN",
}


def _resolve_language(language: str) -> str:
    if not language:
        return "en-IN"
    key = language.strip().lower()
    return _LANGUAGE_ALIASES.get(key, language)

def generate_script(question: str, snippets: List[Dict], language: str = "en-IN") -> List[Dict[str, str]]:
    style = load_style()
    context = snippets_to_context(snippets)
    target_language = _resolve_language(language)

    if _should_use_gemini(target_language):
        try:
            return _generate_with_gemini(question, style, context, target_language)
        except Exception as exc:
            print(f"Gemini generation failed ({exc}). Falling back to SarvamAI.")

    return _generate_with_sarvam(question, style, context, target_language)


def _should_use_gemini(language_code: str) -> bool:
    return language_code.lower().startswith("en")


def _generate_with_sarvam(question: str, style: str, context: str, target_language: str) -> List[Dict[str, str]]:
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not set. Add it to your .env")

    client = SarvamAI(api_subscription_key=api_key)

    prompt = (
        f"Question: {question}\n"
        f"Target language code: {target_language}\n"
        f"Research snippets:\n{context}\n\n"
        "Follow the style guide and return ONLY the JSON array."
    )

    messages = [
        {"role": "system", "content": style},
        {"role": "user", "content": prompt}
    ]

    response = client.chat.completions(
        messages=messages,
        temperature=0.4,
        top_p=0.9,
        max_tokens=800
    )

    if not response.choices:
        raise RuntimeError("Empty response from SarvamAI")

    raw = response.choices[0].message.content.strip()
    return _parse_dialogue(raw, provider="SarvamAI")


def _generate_with_gemini(question: str, style: str, context: str, target_language: str) -> List[Dict[str, str]]:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set. Required to use Gemini for English summaries.")
    if genai is None:
        raise RuntimeError("google-generativeai package is not available. Install it via pip to use Gemini.")

    genai.configure(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-pro-002")
    model = genai.GenerativeModel(model_name=model_name)

    prompt = (
        f"{style}\n\n"
        f"Question: {question}\n"
        f"Target language code: {target_language}\n"
        "Respond with natural English that matches the style guide when the target language is English.\n"
        f"Research snippets:\n{context}\n\n"
        "Return ONLY the JSON array described in the style guide."
    )

    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.4,
            "top_p": 0.9,
            "max_output_tokens": 1024,
        },
    )

    raw = _extract_gemini_text(response)
    if not raw:
        raise RuntimeError("Gemini returned no text content")

    return _parse_dialogue(raw, provider="Gemini")


def _extract_gemini_text(response) -> str:
    if not response:
        return ""

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return (getattr(response, "text", "") or "").strip()

    candidate = candidates[0]
    finish_reason = getattr(candidate, "finish_reason", None)
    content = getattr(candidate, "content", None)
    parts = getattr(content, "parts", []) if content else []

    texts: List[str] = []
    for part in parts:
        part_text = getattr(part, "text", None)
        if part_text:
            texts.append(part_text)

    if not texts:
        raise RuntimeError(f"Gemini finished without textual output (finish_reason={finish_reason})")

    return "\n".join(texts).strip()


def _parse_dialogue(raw: str, provider: str) -> List[Dict[str, str]]:
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        raw = match.group(0)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse JSON from {provider}. Raw response: {raw}") from exc

    if not isinstance(data, list):
        raise RuntimeError(f"{provider} response is not a JSON array as expected")

    normalised = []
    for item in data:
        if not isinstance(item, dict):
            continue
        character = item.get("character")
        dialogue = item.get("dialogue")
        if character not in ("A", "K") or not isinstance(dialogue, str):
            continue
        normalised.append({"character": character, "dialogue": dialogue.strip()})

    if not normalised:
        raise RuntimeError(f"{provider} response did not contain any valid dialogue lines")

    return normalised
