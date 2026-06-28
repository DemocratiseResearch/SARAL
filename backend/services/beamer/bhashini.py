from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

# BCP-47 → English display name used in models.json target_language field.
LANGUAGE_DISPLAY_NAMES: dict[str, str] = {
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
    "mni-IN": "Manipuri_Bengali",
}


class BhashiniRegistry:

    def __init__(self, models_json_path: str) -> None:
        self._models: dict[str, dict] = {}  # key: lowercase display name
        self._load(models_json_path)

    def _load(self, path: str) -> None:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        for entry in data:
            if entry.get("model_type") == "mt":
                key = entry.get("target_language", "").strip().lower()
                if key:
                    self._models[key] = entry
        log.info("bhashini: loaded %d MT models", len(self._models))

    def translate(self, text: str, target_lang_code: str) -> str:
        if not text or target_lang_code == "en-IN":
            return text

        display_name = LANGUAGE_DISPLAY_NAMES.get(target_lang_code)
        if not display_name:
            log.warning("bhashini: no display name mapping for %s, skipping translation", target_lang_code)
            return text

        model = self._models.get(display_name.lower())
        if not model:
            log.warning("bhashini: no MT model for %r, skipping translation", display_name)
            return text

        payload = {"input_text": text}
        # Manipuri's MT model on IIIT-H runs slower than the others — first
        # request often takes >30s. Bump timeout + retry once on failure.
        is_slow_lang = target_lang_code == "mni-IN"
        timeout_seconds = 120.0 if is_slow_lang else 30.0
        max_attempts = 3 if is_slow_lang else 1

        last_exc: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                resp = httpx.post(
                    model["api_url"],
                    json=payload,
                    headers={"access-token": model["access_token"], "Content-Type": "application/json"},
                    timeout=timeout_seconds,
                )
                resp.raise_for_status()
                data = resp.json().get("data", {})
                translated = data.get("output_text", "")
                if translated:
                    return translated
                log.warning("bhashini: empty output_text for %r (attempt %d/%d)", display_name, attempt, max_attempts)
            except Exception as exc:
                last_exc = exc
                log.warning("bhashini: attempt %d/%d failed (%s): %s", attempt, max_attempts, target_lang_code, exc)
        log.warning("bhashini: translation failed after %d attempt(s) (%s), keeping English: %s", max_attempts, target_lang_code, last_exc)
        return text

    def translate_list(self, items: list[str], target_lang_code: str) -> list[str]:
        """Translate a list of strings, preserving order.  Falls back per-item."""
        return [self.translate(item, target_lang_code) for item in items]


# ---------------------------------------------------------------------------
# Module-level singleton — created lazily on first use.
# ---------------------------------------------------------------------------
_registry: BhashiniRegistry | None = None


def get_registry() -> BhashiniRegistry | None:
    """Return the shared BhashiniRegistry, or None if models.json is unavailable."""
    global _registry
    if _registry is not None:
        return _registry

    # Prefer explicit env var; fall back to sibling audio-gen directory.
    path = os.getenv("MODELS_JSON_PATH")
    if not path:
        # Local dev: cwd is services/beamer, models.json is in sibling audio-gen/
        candidate = Path(__file__).parent.parent / "audio-gen" / "models.json"
        if candidate.exists():
            path = str(candidate)

    if not path or not Path(path).exists():
        log.warning("bhashini: models.json not found — slide translation disabled")
        return None

    try:
        _registry = BhashiniRegistry(path)
    except Exception as exc:
        log.warning("bhashini: failed to load registry: %s — slide translation disabled", exc)
        return None

    return _registry
