"""
Unified TTS Service supporting Kokoro, Bhashini, and Sarvam APIs
For Whiteboard and Manim video generation
"""

import os
import logging
import requests
import subprocess
from typing import Optional, Tuple
from pathlib import Path
from .kokoro_tts_service import generate_audio as kokoro_generate_audio

logger = logging.getLogger(__name__)


class UnifiedTTSService:
    """Unified TTS service supporting multiple providers"""

    # Bhashini language endpoints
    BHASHINI_ENDPOINTS = {
        "english": "https://canvas.iiit.ac.in/sandboxbeprod/generate_tts/67bca8b3e0b95a6a1ea34a93",
        "hindi": "https://canvas.iiit.ac.in/sandboxbeprod/generate_tts/67bca89ae0b95a6a1ea34a92",
        "gujarati": "https://canvas.iiit.ac.in/sandboxbeprod/generate_tts/67bca8cbe0b95a6a1ea34a94",
        "marathi": "https://canvas.iiit.ac.in/sandboxbeprod/generate_tts/67bca8e8e0b95a6a1ea34a95",
        "telugu": "https://canvas.iiit.ac.in/sandboxbeprod/generate_tts/67bca880e0b95a6a1ea34a91",
    }

    # Sarvam language codes (Sarvam supports multiple Indian languages)
    SARVAM_LANGUAGES = {
        "hindi": "hi-IN",
        "bengali": "bn-IN",
        "kannada": "kn-IN",
        "malayalam": "ml-IN",
        "marathi": "mr-IN",
        "odia": "od-IN",
        "punjabi": "pa-IN",
        "tamil": "ta-IN",
        "telugu": "te-IN",
        "gujarati": "gu-IN",
    }

    def __init__(self):
        self.bhashini_token = os.getenv("BHASHINI_ACCESS_TOKEN")
        self.sarvam_api_key = os.getenv("SARVAM_API_KEY")

    def generate_audio(
        self,
        text: str,
        provider: str = "kokoro",
        gender: str = "female",
        language: str = "english",
        output_filename: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Generate audio from text using specified TTS provider

        Args:
            text: Text to synthesize
            provider: TTS provider ("kokoro", "bhashini", "sarvam")
            gender: Voice gender for Bhashini ("male" or "female")
            language: Language for Bhashini ("english", "hindi", "gujarati", "marathi", "telugu")
            output_filename: Optional output filename

        Returns:
            Tuple of (audio_file_path, subtitle_file_path)
            Note: Only Kokoro returns subtitles
        """
        provider = provider.lower()
        logger.info(
            f"🔊 UNIFIED TTS - Provider: {provider}, Gender: {gender}, Language: {language}"
        )

        if provider == "kokoro":
            return self._generate_kokoro(text, output_filename)
        elif provider == "bhashini":
            return self._generate_bhashini(text, gender, language, output_filename)
        elif provider == "sarvam":
            return self._generate_sarvam(text, language, output_filename)
        else:
            logger.error(f"Unknown TTS provider: {provider}, falling back to Kokoro")
            return self._generate_kokoro(text, output_filename)

    def _generate_kokoro(
        self, text: str, output_filename: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        """Generate audio using Kokoro TTS (with subtitles)"""
        try:
            logger.info("🎤 Generating audio with Kokoro TTS...")
            # Kokoro uses output_dir not output_filename
            output_dir = None
            if output_filename:
                output_dir = str(Path(output_filename).parent)

            audio_file, subtitle_file = kokoro_generate_audio(
                text, output_dir=output_dir
            )

            if audio_file:
                logger.info(f"✅ Kokoro audio generated: {audio_file}")
                if subtitle_file:
                    logger.info(f"✅ Subtitles generated: {subtitle_file}")
            return audio_file, subtitle_file
        except Exception as e:
            logger.error(f"❌ Kokoro TTS error: {e}")
            return None, None

    def _generate_bhashini(
        self, text: str, gender: str, language: str, output_filename: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        """Generate audio using Bhashini API (no subtitles, 30 words max per request)"""
        try:
            if not self.bhashini_token:
                logger.error("❌ Bhashini access token not configured")
                return None, None

            # Get language-specific endpoint
            language = language.lower()
            endpoint = self.BHASHINI_ENDPOINTS.get(language)
            if not endpoint:
                logger.error(
                    f"❌ Unsupported Bhashini language: {language}, defaulting to English"
                )
                endpoint = self.BHASHINI_ENDPOINTS["english"]

            logger.info(f"🎤 Generating audio with Bhashini TTS ({language})...")

            # Split text into chunks of 30 words (Bhashini limit)
            words = text.split()
            chunks = [" ".join(words[i : i + 30]) for i in range(0, len(words), 30)]

            if len(chunks) > 1:
                logger.info(
                    f"📝 Splitting text into {len(chunks)} chunks (30 words max per chunk)"
                )

            audio_files = []
            for i, chunk in enumerate(chunks):
                logger.info(f"🔄 Processing chunk {i+1}/{len(chunks)}")
                response = requests.post(
                    endpoint,
                    headers={"access-token": self.bhashini_token},
                    json={"text": chunk, "gender": gender},
                    timeout=30,
                )

                if response.status_code == 200:
                    result = response.json()
                    if result.get("status") == "success":
                        s3_url = result["data"]["s3_url"]

                        # Download audio from S3
                        audio_response = requests.get(s3_url, timeout=30)
                        if audio_response.status_code == 200:
                            temp_file = f"temp/audio/bhashini_chunk_{i}.wav"
                            Path("temp/audio").mkdir(parents=True, exist_ok=True)
                            with open(temp_file, "wb") as f:
                                f.write(audio_response.content)
                            audio_files.append(temp_file)
                        else:
                            logger.error(
                                f"❌ Failed to download audio from S3: {s3_url}"
                            )
                    else:
                        logger.error(f"❌ Bhashini API error: {result.get('error')}")
                else:
                    logger.error(
                        f"❌ Bhashini API request failed: {response.status_code}"
                    )

            if not audio_files:
                return None, None

            # Concatenate audio files if multiple chunks
            if len(audio_files) > 1:
                final_audio = output_filename or "temp/audio/bhashini_output.wav"
                Path("temp/audio").mkdir(parents=True, exist_ok=True)

                # Use FFmpeg to concatenate
                import subprocess

                concat_list = "temp/audio/concat_list.txt"
                with open(concat_list, "w") as f:
                    for audio_file in audio_files:
                        f.write(f"file '{os.path.abspath(audio_file)}'\n")

                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        concat_list,
                        "-c",
                        "copy",
                        final_audio,
                    ],
                    check=True,
                    capture_output=True,
                )

                # Cleanup
                for audio_file in audio_files:
                    if os.path.exists(audio_file):
                        os.remove(audio_file)
                if os.path.exists(concat_list):
                    os.remove(concat_list)

                logger.info(
                    f"✅ Bhashini audio generated (concatenated {len(audio_files)} chunks): {final_audio}"
                )
                return final_audio, None
            else:
                # Single chunk
                final_audio = output_filename or audio_files[0]
                if output_filename and audio_files[0] != output_filename:
                    import shutil

                    shutil.move(audio_files[0], final_audio)
                logger.info(f"✅ Bhashini audio generated: {final_audio}")
                return final_audio, None

        except Exception as e:
            logger.error(f"❌ Bhashini TTS error: {e}")
            return None, None

    def _split_text_for_sarvam(self, text: str, max_length: int = 450) -> list[str]:
        """Split text into chunks of max_length characters, respecting sentence boundaries"""
        if len(text) <= max_length:
            return [text]

        chunks = []
        sentences = (
            text.replace("! ", "!|").replace("? ", "?|").replace(". ", ".|").split("|")
        )

        current_chunk = ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            # If adding this sentence exceeds max_length, save current chunk
            if len(current_chunk) + len(sentence) + 1 > max_length:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence

        # Add the last chunk
        if current_chunk:
            chunks.append(current_chunk.strip())

        return chunks

    def _generate_sarvam(
        self, text: str, language: str, output_filename: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        """Generate audio using Sarvam API (no subtitles, supports multiple Indian languages)"""
        try:
            if not self.sarvam_api_key:
                logger.error("❌ Sarvam API key not configured")
                return None, None

            # Get language code
            language = language.lower()
            language_code = self.SARVAM_LANGUAGES.get(language)
            if not language_code:
                logger.error(
                    f"❌ Unsupported Sarvam language: {language}, defaulting to Hindi"
                )
                language_code = "hi-IN"
                language = "hindi"

            # Split text into chunks (Sarvam has 500 char limit)
            chunks = self._split_text_for_sarvam(text, max_length=450)
            logger.info(
                f"🎤 Generating audio with Sarvam TTS ({language}) - {len(chunks)} chunk(s)..."
            )

            # Sarvam TTS endpoint
            url = "https://api.sarvam.ai/text-to-speech"

            headers = {
                "Content-Type": "application/json",
                "API-Subscription-Key": self.sarvam_api_key,
            }

            audio_files = []

            for i, chunk in enumerate(chunks):
                logger.info(
                    f"  Processing chunk {i+1}/{len(chunks)} ({len(chunk)} chars)..."
                )

                payload = {
                    "inputs": [chunk],
                    "target_language_code": language_code,  # Dynamic based on selected language
                    "speaker": "anushka",  # Female voice
                    "pitch": 0,
                    "pace": 1.0,
                    "loudness": 1.5,
                    "speech_sample_rate": 22050,
                    "enable_preprocessing": True,
                    "model": "bulbul:v2",
                }

                response = requests.post(url, headers=headers, json=payload, timeout=30)

                if response.status_code == 200:
                    result = response.json()
                    if result.get("audios") and len(result["audios"]) > 0:
                        # Sarvam returns base64 encoded audio
                        import base64

                        audio_base64 = result["audios"][0]
                        audio_bytes = base64.b64decode(audio_base64)

                        # Save chunk audio
                        chunk_filename = f"temp/audio/sarvam_chunk_{i}.wav"
                        Path("temp/audio").mkdir(parents=True, exist_ok=True)

                        with open(chunk_filename, "wb") as f:
                            f.write(audio_bytes)

                        audio_files.append(chunk_filename)
                        logger.info(f"  ✅ Chunk {i+1} saved: {chunk_filename}")
                    else:
                        logger.error(f"❌ Sarvam API returned no audio for chunk {i+1}")
                        return None, None
                else:
                    logger.error(
                        f"❌ Sarvam API request failed for chunk {i+1}: {response.status_code} - {response.text}"
                    )
                    return None, None

            # Concatenate audio files if multiple chunks
            if len(audio_files) > 1:
                logger.info(f"🔗 Concatenating {len(audio_files)} audio chunks...")
                final_audio = output_filename or "temp/audio/sarvam_output.wav"

                # Create FFmpeg concat file
                concat_file = "temp/audio/sarvam_concat.txt"
                with open(concat_file, "w") as f:
                    for audio_file in audio_files:
                        f.write(f"file '{os.path.abspath(audio_file)}'\n")

                # Concatenate using FFmpeg
                concat_cmd = [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    concat_file,
                    "-c",
                    "copy",
                    final_audio,
                ]

                subprocess.run(concat_cmd, check=True, capture_output=True, timeout=60)

                # Clean up temporary files
                for audio_file in audio_files:
                    try:
                        os.remove(audio_file)
                    except:
                        pass
                try:
                    os.remove(concat_file)
                except:
                    pass

                logger.info(
                    f"✅ Sarvam audio generated (concatenated {len(audio_files)} chunks): {final_audio}"
                )
                return final_audio, None
            else:
                # Single chunk
                final_audio = output_filename or audio_files[0]
                if output_filename and audio_files[0] != output_filename:
                    import shutil

                    shutil.move(audio_files[0], final_audio)
                logger.info(f"✅ Sarvam audio generated: {final_audio}")
                return final_audio, None

        except Exception as e:
            logger.error(f"❌ Sarvam TTS error: {e}")
            return None, None


# Convenience function for use in routes
def generate_audio_unified(
    text: str,
    provider: str = "kokoro",
    gender: str = "female",
    language: str = "english",
    output_filename: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate audio using specified TTS provider

    Args:
        text: Text to synthesize
        provider: TTS provider ("kokoro", "bhashini", "sarvam")
        gender: Voice gender for Bhashini ("male" or "female")
        language: Language for Bhashini ("english", "hindi", "gujarati", "marathi", "telugu")
        output_filename: Optional output filename

    Returns:
        Tuple of (audio_file_path, subtitle_file_path)
    """
    service = UnifiedTTSService()
    return service.generate_audio(text, provider, gender, language, output_filename)
