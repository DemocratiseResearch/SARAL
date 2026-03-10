"""
Sarvam AI TTS client — text-to-speech for 11 Indian languages.
Handles text chunking (grapheme-aware for complex scripts) and audio concatenation.
"""

import os
import re
import base64
import shutil
import subprocess
import logging
from pathlib import Path
from typing import Optional

import requests
import grapheme

logger = logging.getLogger(__name__)

# ── Language mapping ──────────────────────────────────────────────────────────
SUPPORTED_LANGUAGES = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Bengali": "bn-IN",
    "Gujarati": "gu-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Marathi": "mr-IN",
    "Odia": "od-IN",
    "Punjabi": "pa-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
}

# Languages with complex scripts that need grapheme-aware chunking
COMPLEX_SCRIPT_LANGUAGES = {"hindi", "bengali", "marathi", "gujarati"}

VOICE_MAP = {"meera": "vidya", "arjun": "karun"}

TTS_API_URL = "https://api.sarvam.ai/text-to-speech"


def get_language_code(language: str) -> Optional[str]:
    """Resolve language name or code to Sarvam language code."""
    if language in SUPPORTED_LANGUAGES:
        return SUPPORTED_LANGUAGES[language]
    if language in SUPPORTED_LANGUAGES.values():
        return language
    return None


def is_language_supported(language: str) -> bool:
    return language in SUPPORTED_LANGUAGES or language in SUPPORTED_LANGUAGES.values()


def get_supported_languages() -> dict[str, str]:
    return SUPPORTED_LANGUAGES.copy()


# ── TTS synthesis ─────────────────────────────────────────────────────────────

def synthesize_text(api_key: str, text: str, language_code: str, voice: str = "vidya") -> bytes:
    """
    Call Sarvam TTS API for a single chunk of text.
    Returns raw audio bytes (WAV).
    """
    voice = VOICE_MAP.get(voice, voice)

    headers = {"api-subscription-key": api_key, "Content-Type": "application/json"}
    payload = {
        "inputs": [text],
        "target_language_code": language_code,
        "speaker": voice,
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 22050,
        "enable_preprocessing": True,
        "model": "bulbul:v2",
    }

    resp = requests.post(TTS_API_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Sarvam TTS API error {resp.status_code}: {resp.text}")

    data = resp.json()
    audios = data.get("audios", [])
    audio_b64 = audios[0] if isinstance(audios, list) and audios else audios
    if isinstance(audio_b64, str) and audio_b64.startswith("data:audio"):
        audio_b64 = audio_b64.split(",", 1)[1]

    audio_bytes = base64.b64decode(audio_b64)
    if len(audio_bytes) < 100:
        raise RuntimeError("Audio response too small — likely empty")
    return audio_bytes


def synthesize_long_text(
    api_key: str,
    text: str,
    output_path: str,
    language_code: str,
    voice: str = "vidya",
    language: str = "English",
) -> bool:
    """
    Synthesize text that may exceed the API's max chunk size.
    Chunks the text, synthesizes each chunk, and concatenates via ffmpeg.
    """
    text = _clean_text(text)
    if not text:
        return False

    max_len = 450 if language.lower() in COMPLEX_SCRIPT_LANGUAGES else 500
    chunks = _chunk_text(text, max_len, language)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_dir = os.path.join(os.path.dirname(output_path), "temp_chunks")
    Path(temp_dir).mkdir(exist_ok=True)

    chunk_files: list[str] = []
    base = Path(output_path).stem

    for i, chunk in enumerate(chunks):
        chunk_path = os.path.join(temp_dir, f"{base}_chunk_{i:03d}.wav")
        try:
            audio_bytes = synthesize_text(api_key, chunk, language_code, voice)
            with open(chunk_path, "wb") as f:
                f.write(audio_bytes)
            chunk_files.append(chunk_path)
        except Exception as e:
            logger.warning(f"Chunk {i + 1}/{len(chunks)} failed: {e}")

    if not chunk_files:
        return False

    # Concatenate chunks
    if len(chunk_files) == 1:
        shutil.copy(chunk_files[0], output_path)
    else:
        _concat_wav_files(chunk_files, output_path, temp_dir, base)

    return os.path.exists(output_path) and os.path.getsize(output_path) > 1000


def test_connection(api_key: str) -> bool:
    """Quick API reachability test."""
    try:
        synthesize_text(api_key, "test", "hi-IN", "vidya")
        return True
    except Exception:
        return False


# ── Translation ───────────────────────────────────────────────────────────────

def translate_text(api_key: str, text: str, target_language: str, mode: str = "code-mixed") -> Optional[str]:
    """Translate English text to a target language via Sarvam's translation API."""
    from sarvamai import SarvamAI

    target_code = get_language_code(target_language)
    if not target_code:
        raise ValueError(f"Unsupported language: {target_language}")

    max_chunk = 990
    if len(text) <= max_chunk:
        return _translate_chunk(api_key, text, target_code, mode)

    translated: list[str] = []
    for chunk in _split_sentences(text, max_chunk):
        result = _translate_chunk(api_key, chunk, target_code, mode)
        if result:
            translated.append(result)
    return " ".join(translated)


def _translate_chunk(api_key: str, text: str, target_code: str, mode: str) -> Optional[str]:
    from sarvamai import SarvamAI
    client = SarvamAI(api_subscription_key=api_key)
    try:
        resp = client.text.translate(
            input=text,
            source_language_code="en-IN",
            target_language_code=target_code,
            model="mayura:v1",
            mode=mode,
        )
        return resp.translated_text
    except Exception as e:
        logger.warning(f"Translation error: {e}")
        return None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"#+\s*", "", text)
    text = re.sub(r"[^\w\s.,!?;:\-()\"\']", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _chunk_text(text: str, max_len: int, language: str) -> list[str]:
    """Split text respecting sentence boundaries and grapheme clusters."""
    use_grapheme = language.lower() in COMPLEX_SCRIPT_LANGUAGES
    length_fn = grapheme.length if use_grapheme else len

    if length_fn(text) <= max_len:
        return [text]

    # Split on sentence endings (Hindi danda, standard punctuation)
    pattern = r"(?<=[।॥.!?])\s+" if use_grapheme else r"(?<=[.!?])\s+"
    sentences = re.split(pattern, text)

    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        if length_fn(current) + length_fn(sentence) + 1 > max_len:
            if current:
                chunks.append(current.strip())
            # Handle sentence longer than max_len
            if length_fn(sentence) > max_len:
                for word_chunk in _split_by_words(sentence, max_len, length_fn):
                    chunks.append(word_chunk)
                current = ""
            else:
                current = sentence + " "
        else:
            current += sentence + " "

    if current.strip():
        chunks.append(current.strip())

    return chunks


def _split_by_words(text: str, max_len: int, length_fn) -> list[str]:
    chunks: list[str] = []
    current = ""
    for word in text.split():
        if length_fn(current) + length_fn(word) + 1 > max_len:
            if current:
                chunks.append(current.strip())
            current = word + " "
        else:
            current += word + " "
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _split_sentences(text: str, max_size: int) -> list[str]:
    """Split by sentence delimiters, grouping into chunks ≤ max_size."""
    delimiters = [". ", "! ", "? ", ".\n", "!\n", "?\n"]
    sentences: list[str] = []
    remaining = text

    while remaining:
        indices = [(remaining.find(d), d) for d in delimiters if remaining.find(d) != -1]
        if not indices:
            sentences.append(remaining)
            break
        idx, delim = min(indices, key=lambda x: x[0])
        sentences.append(remaining[: idx + len(delim)])
        remaining = remaining[idx + len(delim) :]

    chunks: list[str] = []
    current = ""
    for s in sentences:
        if len(current) + len(s) <= max_size:
            current += s
        else:
            if current:
                chunks.append(current.strip())
            current = s
    if current:
        chunks.append(current.strip())
    return chunks


def _concat_wav_files(chunk_files: list[str], output_path: str, temp_dir: str, base: str):
    """Concatenate WAV files using ffmpeg."""
    list_file = os.path.join(temp_dir, f"{base}_list.txt")
    with open(list_file, "w") as f:
        for cf in chunk_files:
            f.write(f"file '{os.path.abspath(cf)}'\n")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", output_path],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        # Fallback: just use the first chunk
        shutil.copy(chunk_files[0], output_path)
