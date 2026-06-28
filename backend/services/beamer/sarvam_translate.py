from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)

_TRANSLATE_URL = "https://api.sarvam.ai/translate"

# BCP-47 codes handled by mayura:v1 (classic-colloquial, core Indic).
_MAYURA_V1_LANGS: set[str] = {
    "bn-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN",
    "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
}

# BCP-47 codes handled only by sarvam-translate:v1 (formal, extended langs).
_SARVAM_TRANSLATE_V1_LANGS: set[str] = {
    "as-IN", "brx-IN", "doi-IN", "kok-IN", "mai-IN",
    "mni-IN", "ne-IN", "sa-IN", "sat-IN", "ur-IN",
}


class SarvamTranslator:

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def translate(self, text: str, target_lang_code: str) -> str:
        if not text or target_lang_code == "en-IN":
            return text

        if target_lang_code in _MAYURA_V1_LANGS:
            model = "mayura:v1"
            mode = "formal"
        elif target_lang_code in _SARVAM_TRANSLATE_V1_LANGS:
            model = "sarvam-translate:v1"
            mode = "formal"
        else:
            log.warning("sarvam_translate: unsupported language %s, skipping", target_lang_code)
            return text

        payload = {
            "input": text,
            "source_language_code": "en-IN",
            "target_language_code": target_lang_code,
            "model": model,
            "mode": mode,
            "enable_preprocessing": True,
        }
        try:
            resp = httpx.post(
                _TRANSLATE_URL,
                json=payload,
                headers={
                    "api-subscription-key": self._api_key,
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            translated = resp.json().get("translated_text", "")
            if translated:
                return translated
            log.warning("sarvam_translate: empty translated_text for %s", target_lang_code)
            return text
        except Exception as exc:
            log.warning("sarvam_translate: translation failed (%s), keeping English: %s", target_lang_code, exc)
            return text

    def translate_list(self, items: list[str], target_lang_code: str) -> list[str]:
        """Translate a list of strings, preserving order. Falls back per-item."""
        return [self.translate(item, target_lang_code) for item in items]


# ---------------------------------------------------------------------------
# Module-level singleton — created lazily on first use.
# ---------------------------------------------------------------------------
_translator: SarvamTranslator | None = None


def get_translator() -> SarvamTranslator | None:
    global _translator
    if _translator is not None:
        return _translator

    api_key = os.getenv("SARVAM_API_KEY", "")
    if not api_key:
        log.warning("sarvam_translate: SARVAM_API_KEY not set — slide translation disabled")
        return None

    _translator = SarvamTranslator(api_key)
    return _translator
