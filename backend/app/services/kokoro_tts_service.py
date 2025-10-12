"""
Kokoro TTS Service
High-quality text-to-speech with word-level timing for subtitle generation
"""

import os
import logging
import tempfile
import numpy as np
import soundfile as sf
from typing import Optional, Tuple, List, Dict
from pathlib import Path

logging.basicConfig(level=logging.INFO)


def generate_audio_with_kokoro(
    text: str,
    voice_lang: str = "a",
    voice_preset: str = "af_heart",
    output_filename: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate audio from text using Kokoro TTS and create synchronized subtitle file.

    Args:
        text: The text to synthesize
        voice_lang: Language code (e.g., 'a' for American English)
        voice_preset: Voice preset name (default: "af_heart" for female voice)
        output_filename: Optional output filename (auto-generated if None)

    Returns:
        Tuple of (audio_file_path, subtitle_file_path) or (None, None) on failure
    """
    if not text.strip():
        logging.error("❌ Text for TTS cannot be empty")
        raise ValueError("Text for TTS cannot be empty")

    try:
        # Import Kokoro
        try:
            from kokoro import KPipeline
        except ImportError:
            logging.error("❌ Kokoro not installed. Run: pip install kokoro-onnx")
            raise ImportError(
                "Kokoro TTS library not found. Install with: pip install kokoro-onnx"
            )

        # Import subtitle service
        from .subtitle_service import generate_subtitle_file

        # Initialize pipeline
        logging.info(
            f"🎙️ Initializing Kokoro TTS (lang={voice_lang}, voice={voice_preset})"
        )
        pipeline = KPipeline(lang_code=voice_lang)

        # Generate output filename if not provided
        if output_filename is None:
            temp_dir = Path("temp/audio")
            temp_dir.mkdir(parents=True, exist_ok=True)
            output_filename = str(temp_dir / f"kokoro_{os.urandom(8).hex()}.wav")

        audio_segments = []
        all_tokens: List[Dict] = []
        current_time_offset = 0.0
        rate = 24000  # Kokoro sample rate

        # Process text in segments
        logging.info(f"🔊 Generating audio for {len(text)} characters...")
        for result in pipeline(
            text, voice=voice_preset, speed=1.0, split_pattern=r"\n+"
        ):
            audio_segments.append(result.audio)

            chunk_duration = len(result.audio) / rate

            # Extract word-level timing if available
            if hasattr(result, "tokens"):
                for token in result.tokens:
                    start_ts = token.start_ts if token.start_ts is not None else 0
                    end_ts = (
                        token.end_ts if token.end_ts is not None else chunk_duration
                    )

                    all_tokens.append(
                        {
                            "text": token.text.strip(),
                            "start": current_time_offset + start_ts,
                            "end": current_time_offset + end_ts,
                        }
                    )

            current_time_offset += chunk_duration

        if not audio_segments:
            logging.error("❌ No audio generated")
            return None, None

        # Concatenate all audio segments
        final_audio = np.concatenate(audio_segments)

        # Save audio file
        sf.write(output_filename, final_audio, rate)
        audio_duration = len(final_audio) / rate
        logging.info(f"✅ Audio saved: {output_filename} ({audio_duration:.2f}s)")

        # Generate subtitle file
        subtitle_file_path = generate_subtitle_file(all_tokens, output_filename)

        return output_filename, subtitle_file_path

    except Exception as e:
        logging.error(f"❌ Error during Kokoro TTS generation: {e}", exc_info=True)

        # Cleanup on error
        if output_filename and os.path.exists(output_filename):
            try:
                os.remove(output_filename)
            except:
                pass

        return None, None


def generate_audio(
    text: str,
    voice_lang: str = "a",
    voice_preset: str = "af_heart",
    output_dir: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Main audio generation function (wrapper for Kokoro TTS).
    Compatible with existing code that calls generate_audio().

    Args:
        text: Text to synthesize
        voice_lang: Language code (default: 'a' for American English)
        voice_preset: Voice preset (default: 'af_heart' for female voice)
        output_dir: Optional output directory

    Returns:
        Tuple of (audio_file_path, subtitle_file_path)
    """
    if not text.strip():
        logging.error("❌ Empty text provided for TTS")
        return None, None

    try:
        # Create output filename
        if output_dir:
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            output_filename = os.path.join(
                output_dir, f"audio_{os.urandom(8).hex()}.wav"
            )
        else:
            output_filename = None

        # Generate with Kokoro
        return generate_audio_with_kokoro(
            text=text,
            voice_lang=voice_lang,
            voice_preset=voice_preset,
            output_filename=output_filename,
        )

    except Exception as e:
        logging.error(f"❌ Audio generation failed: {e}", exc_info=True)
        return None, None


# Voice presets available in Kokoro
KOKORO_VOICES = {
    "american_female": "af_heart",
    "american_male": "am_adam",
    "british_female": "bf_emma",
    "british_male": "bm_lewis",
}


def list_available_voices() -> Dict[str, str]:
    """
    Get list of available Kokoro voice presets.

    Returns:
        Dictionary mapping voice names to preset codes
    """
    return KOKORO_VOICES.copy()


if __name__ == "__main__":
    # Test Kokoro TTS
    test_text = """
    Machine learning is a subset of artificial intelligence that enables computers to learn from data.
    Neural networks are inspired by the human brain and consist of interconnected nodes.
    Deep learning uses multiple layers to progressively extract higher-level features from raw input.
    """

    print("🎙️ Testing Kokoro TTS...\n")

    audio_file, subtitle_file = generate_audio(test_text)

    if audio_file and subtitle_file:
        print(f"✅ Audio generated: {audio_file}")
        print(f"✅ Subtitles generated: {subtitle_file}")

        # Print file sizes
        audio_size = os.path.getsize(audio_file) / 1024
        subtitle_size = os.path.getsize(subtitle_file) / 1024
        print(f"\n📊 Audio size: {audio_size:.2f} KB")
        print(f"📊 Subtitle size: {subtitle_size:.2f} KB")

        # Show first few subtitle lines
        print(f"\n📝 First subtitle entries:")
        with open(subtitle_file, "r") as f:
            lines = f.readlines()
            for i, line in enumerate(lines[10:15], 1):  # Skip header
                print(f"  {line.strip()}")
    else:
        print("❌ TTS generation failed")
