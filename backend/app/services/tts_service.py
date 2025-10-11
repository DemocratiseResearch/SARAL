import os
from pathlib import Path
from typing import Dict, List, Optional
from .sarvam_sdk import SarvamTTS, SarvamTTSError
from .language_service import get_language_code, is_language_supported
import re
import subprocess
import grapheme  # Add this import for proper Unicode grapheme handling

import json
import aiohttp
import asyncio
from fastapi import HTTPException

def clean_script_for_tts_and_video(script_text):
    """Clean script text for TTS processing."""
    if not script_text or not script_text.strip():
        return ""

    script_text = re.sub(r'\*\*([^*]+)\*\*', r'\1', script_text)
    script_text = re.sub(r'\*([^*]+)\*', r'\1', script_text)
    script_text = re.sub(r'#+\s*', '', script_text)
    script_text = re.sub(
        r'[^\w\s.,!?;:\-()"\''        # Keep standard characters
        r'\u0900-\u097F'              # Devanagari (Hindi, Marathi)
        r'\u0980-\u09FF'              # Bengali
        r'\u0A80-\u0AFF'              # Gujarati
        r'\u0B00-\u0B7F'              # Odia
        r'\u0B80-\u0BFF'              # Tamil
        r'\u0C00-\u0C7F'              # Telugu
        r'\u0C80-\u0CFF'              # Kannada
        r'\u0D00-\u0D7F'              # Malayalam
        r']', 
        ' ', 
        script_text
    )
    script_text = re.sub(r'\s+', ' ', script_text)

    return script_text.strip()

def ensure_audio_is_generated(
    sarvam_api_key: str,
    language: str,
    paper_id: str,
    title_intro_script: str,
    sections_scripts: Dict[str, str],
    voice_selections: Dict[str, str],
    hinglish_iterations: int = 3,
    openai_api_key: Optional[str] = None,
    show_hindi_debug: bool = False
) -> List[str]:
    """Generate audio files - simplified approach aligned with Streamlit"""
    
    audio_files = []
    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if not sarvam_api_key or sarvam_api_key.strip() == "":
        raise ValueError("Sarvam API key is required")

    voice = voice_selections.get(language, "meera")
    print(f"Using voice: {voice}")
    if voice == "meera":
        voice = "vidya"
    elif voice == "arjun":
        voice = "karun"

    # Initialize TTS client
    try:
        tts_client = SarvamTTS(api_key=sarvam_api_key)
        
        # Simple connection test
        if not tts_client.test_connection():
            raise ValueError("Failed to connect to Sarvam API")
        
        print("✓ Connected to Sarvam TTS API")
        
    except Exception as e:
        print(f"TTS client initialization failed: {e}")
        raise ValueError(f"Failed to initialize TTS client: {e}")

    successful_generations = 0

    try:
        # Generate title audio
        if title_intro_script and title_intro_script.strip():
            print("Generating title audio...")
            title_audio_path = os.path.join(output_dir, "00_title_introduction.wav")
            
            cleaned_text = clean_script_for_tts_and_video(title_intro_script)
            if cleaned_text:
                success = tts_client.synthesize_long_text(
                    text=cleaned_text,
                    output_path=title_audio_path,
                    target_language='en-IN',
                    voice=voice,
                    max_chunk_length=500  # Smaller chunks for reliability
                )
                
                if success:
                    audio_files.append(title_audio_path)
                    successful_generations += 1
                    print(f"✓ Title audio: {title_audio_path}")

        # Generate section audios
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
        
        for i, section_name in enumerate(section_order, start=1):
            if section_name in sections_scripts:
                script_text = sections_scripts[section_name]
                
                if not script_text or not script_text.strip():
                    continue

                print(f"Generating {section_name} audio...")
                audio_path = os.path.join(output_dir, f"{i:02d}_{section_name.lower()}.wav")
                
                cleaned_text = clean_script_for_tts_and_video(script_text)
                if cleaned_text:
                    success = tts_client.synthesize_long_text(
                        text=cleaned_text,
                        output_path=audio_path,
                        target_language='en-IN',
                        voice=voice,
                        max_chunk_length=500
                    )
                    
                    if success:
                        audio_files.append(audio_path)
                        successful_generations += 1
                        print(f"✓ {section_name} audio: {audio_path}")

        if successful_generations == 0:
            raise ValueError("No audio files were generated successfully")

        print(f"✓ Generated {successful_generations} audio files")
        return {
            "audio_files": [Path(f).name for f in audio_files]
        }

    except Exception as e:
        print(f"Audio generation error: {e}")
        raise



def ensure_hindi_audio_is_generated(
    sarvam_api_key: str,
    paper_id: str,
    title_intro_script: str,
    sections_scripts: Dict[str, str],
    voice_selections: Dict[str, str],
    hinglish_iterations: int = 3,
    openai_api_key: Optional[str] = None,
    show_hindi_debug: bool = False
) -> Dict[str, List[str]]:
    """Generate audio files specifically for Hindi scripts with proper chunking
    
    Hindi script requires specialized handling for optimal TTS results:
    - Smaller chunk sizes (max 490 characters)
    - Careful sentence boundary detection
    - Proper handling of mixed script content (Hindi + Latin characters)
    """
    
    audio_files = []
    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if not sarvam_api_key or sarvam_api_key.strip() == "":
        raise ValueError("Sarvam API key is required")

    # Use appropriate voice for Hindi content
    voice = voice_selections.get("Hindi", "vidya")
    print(f"Using Hindi voice: {voice}")
    print("sarvam_api_key", sarvam_api_key)
    # Initialize TTS client
    try:
        tts_client = SarvamTTS(api_key=sarvam_api_key)
        
        # Simple connection test
        if not tts_client.test_connection():
            raise ValueError("Failed to connect to Sarvam API")
        
        print("✓ Connected to Sarvam TTS API")
        
    except Exception as e:
        print(f"TTS client initialization failed: {e}")
        raise ValueError(f"Failed to initialize TTS client: {e}")

    successful_generations = 0
    
    # Add a Hindi-specific chunking method to TTS client
    def chunk_hindi_text(text: str, max_chunk_length: int = 450) -> List[str]:
        """Create smaller chunks for Hindi text, respecting sentence boundaries and keeping grapheme clusters intact"""
        # First check if text is shorter than max length
        if grapheme.length(text) <= max_chunk_length:
            return [text]
        
        # Split on sentence boundaries with priority to Devanagari full stops
        # This regex handles Hindi sentence endings (Devanagari danda and double danda) and standard punctuation
        sentences = re.split(r'(?<=[।॥.!?])\s+', text)
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # Check if adding this sentence would exceed max length using grapheme-aware length
            sentence_grapheme_length = grapheme.length(sentence)
            current_chunk_grapheme_length = grapheme.length(current_chunk)
            
            if current_chunk_grapheme_length + sentence_grapheme_length + 1 > max_chunk_length:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # If the sentence itself is longer than max_chunk_length, 
                # break it at word boundaries while respecting grapheme clusters
                if sentence_grapheme_length > max_chunk_length:
                    words = sentence.split()
                    temp_chunk = ""
                    for word in words:
                        word_grapheme_length = grapheme.length(word)
                        temp_chunk_grapheme_length = grapheme.length(temp_chunk)
                        
                        if temp_chunk_grapheme_length + word_grapheme_length + 1 > max_chunk_length:
                            chunks.append(temp_chunk.strip())
                            temp_chunk = word + " "
                        else:
                            temp_chunk += word + " "
                    
                    if temp_chunk:
                        current_chunk = temp_chunk
                else:
                    current_chunk = sentence + " "
            else:
                current_chunk += sentence + " "
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        # Verify no chunk exceeds the maximum length in graphemes
        for i, chunk in enumerate(chunks):
            chunk_len = grapheme.length(chunk)
            if chunk_len > max_chunk_length:
                print(f"Warning: Chunk {i} has {chunk_len} graphemes, which exceeds the maximum of {max_chunk_length}")
        
        return chunks

    try:
        # Generate title audio
        if title_intro_script and title_intro_script.strip():
            print("Generating Hindi title audio...")
            title_audio_path = os.path.join(output_dir, "00_title_introduction.wav")
            
            cleaned_text = title_intro_script
            if cleaned_text:
                # Get Hindi chunks capped at 490 characters
                hindi_chunks = chunk_hindi_text(cleaned_text)
                print(f"Processing {len(hindi_chunks)} Hindi chunks for title intro")
                # Create temporary directory for chunk files
                temp_dir = os.path.join(output_dir, "temp_chunks")
                Path(temp_dir).mkdir(exist_ok=True)
                
                chunk_files = []
                for j, chunk in enumerate(hindi_chunks):
                    chunk_path = os.path.join(temp_dir, f"00_title_introduction_chunk_{j:03d}.wav")
                    print(f"  Processing chunk {j+1}/{len(hindi_chunks)} ({len(chunk)} chars)")
                    
                    # Use synthesize_text directly instead of synthesize_long_text
                    try:
                        audio_bytes = tts_client.synthesize_text(
                            text=chunk,
                            target_language='hi-IN',  # Specify Hindi language
                            voice=voice
                        )
                        
                        if audio_bytes and len(audio_bytes) > 0:
                            # Write the audio bytes directly to file
                            with open(chunk_path, 'wb') as f:
                                f.write(audio_bytes)
                            chunk_files.append(chunk_path)
                            print(f"  ✓ Generated audio for chunk {j+1}")
                        else:
                            print(f"  ⨯ No audio data returned for chunk {j+1}")
                    except Exception as e:
                        print(f"  ⨯ Error generating audio for chunk {j+1}: {e}")
                
                # If we have generated chunks, combine them
                if chunk_files:
                    # Use ffmpeg to concatenate the audio files
                    # Create a file list for ffmpeg
                    list_file = os.path.join(temp_dir, "00_title_introduction_list.txt")
                    with open(list_file, 'w') as f:
                        for chunk_file in chunk_files:
                            f.write(f"file '{os.path.abspath(chunk_file)}'\n")
                    
                    # Use ffmpeg to concatenate
                    try:
                        subprocess.run([
                            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                            '-i', list_file, '-c', 'copy', title_audio_path
                        ], check=True, capture_output=True)
                        
                        audio_files.append(title_audio_path)
                        successful_generations += 1
                        print(f"✓ Title Hindi audio: {title_audio_path}")
                    except subprocess.CalledProcessError as e:
                        print(f"FFmpeg error: {e.stderr.decode() if e.stderr else e}")
                        # If ffmpeg fails, use the first chunk as fallback
                        if chunk_files:
                            import shutil
                            shutil.copy(chunk_files[0], title_audio_path)
                            audio_files.append(title_audio_path)
                            successful_generations += 1
                            print(f"⚠ Title Hindi audio (fallback): {title_audio_path}")

        # Generate section audios
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
        
        for i, section_name in enumerate(section_order, start=1):
            if section_name in sections_scripts:
                script_text = sections_scripts[section_name]
                
                if not script_text or not script_text.strip():
                    continue

                print(f"Generating Hindi {section_name} audio...")
                audio_path = os.path.join(output_dir, f"{i:02d}_{section_name.lower()}.wav")
                
                cleaned_text = script_text
                if cleaned_text:
                    # Get Hindi chunks capped at 490 characters
                    hindi_chunks = chunk_hindi_text(cleaned_text)
                    print(f"Processing {len(hindi_chunks)} Hindi chunks for {section_name}")
                    # Create temporary directory for chunk files
                    temp_dir = os.path.join(output_dir, "temp_chunks")
                    Path(temp_dir).mkdir(exist_ok=True)
                    
                    chunk_files = []
                    for j, chunk in enumerate(hindi_chunks):
                        chunk_path = os.path.join(temp_dir, f"{i:02d}_{section_name.lower()}_chunk_{j:03d}.wav")
                        print(f"  Processing chunk {j+1}/{len(hindi_chunks)} ({len(chunk)} chars)")
                        
                        # Use synthesize_text directly instead of synthesize_long_text
                        try:
                            audio_bytes = tts_client.synthesize_text(
                                text=chunk,
                                target_language='hi-IN',  # Specify Hindi language
                                voice=voice
                            )
                            
                            if audio_bytes and len(audio_bytes) > 0:
                                # Write the audio bytes directly to file
                                with open(chunk_path, 'wb') as f:
                                    f.write(audio_bytes)
                                chunk_files.append(chunk_path)
                                print(f"  ✓ Generated audio for chunk {j+1}")
                            else:
                                print(f"  ⨯ No audio data returned for chunk {j+1}")
                        except Exception as e:
                            print(f"  ⨯ Error generating audio for chunk {j+1}: {e}")
                    
                    # If we have generated chunks, combine them
                    if chunk_files:
                        # Use ffmpeg to concatenate the audio files
                        # Create a file list for ffmpeg
                        list_file = os.path.join(temp_dir, f"{i:02d}_{section_name.lower()}_list.txt")
                        with open(list_file, 'w') as f:
                            for chunk_file in chunk_files:
                                f.write(f"file '{os.path.abspath(chunk_file)}'\n")
                        
                        # Use ffmpeg to concatenate
                        try:
                            subprocess.run([
                                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                                '-i', list_file, '-c', 'copy', audio_path
                            ], check=True, capture_output=True)
                            
                            audio_files.append(audio_path)
                            successful_generations += 1
                            print(f"✓ {section_name} Hindi audio: {audio_path}")
                        except subprocess.CalledProcessError as e:
                            print(f"FFmpeg error: {e.stderr.decode() if e.stderr else e}")
                            # If ffmpeg fails, use the first chunk as fallback
                            if chunk_files:
                                import shutil
                                shutil.copy(chunk_files[0], audio_path)
                                audio_files.append(audio_path)
                                successful_generations += 1
                                print(f"⚠ {section_name} Hindi audio (fallback): {audio_path}")

        if successful_generations == 0:
            raise ValueError("No Hindi audio files were generated successfully")

        print(f"✓ Generated {successful_generations} Hindi audio files")
        
        # Clean up temp files if needed
        # shutil.rmtree(temp_dir, ignore_errors=True)
        
        return {
            "audio_files": [Path(f).name for f in audio_files]
        }

    except Exception as e:
        print(f"Hindi audio generation error: {e}")
        raise


def ensure_language_audio_is_generated(
    sarvam_api_key: str,
    language: str,
    paper_id: str,
    title_intro_script: str,
    sections_scripts: Dict[str, str],
    voice_selections: Dict[str, str],
    hinglish_iterations: int = 3,
    openai_api_key: Optional[str] = None,
    show_debug: bool = False
) -> Dict[str, List[str]]:
    """Generate audio files for any supported language with appropriate chunking
    
    Args:
        sarvam_api_key: API key for Sarvam TTS
        language: Target language name (e.g., 'Hindi', 'Bengali', 'Tamil')
        paper_id: Unique paper identifier
        title_intro_script: Title/introduction script text
        sections_scripts: Dictionary of section scripts
        voice_selections: Voice selection mapping
        hinglish_iterations: Number of iterations (unused but kept for compatibility)
        openai_api_key: OpenAI API key (unused but kept for compatibility)
        show_debug: Enable debug output
        
    Returns:
        Dict with audio_files list containing generated file names
        
    Raises:
        ValueError: If language is unsupported or API connection fails
    """
    
    # Validate language support
    if not is_language_supported(language):
        raise ValueError(f"Unsupported language: {language}")
    
    language_code = get_language_code(language)
    
    audio_files = []
    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if not sarvam_api_key or sarvam_api_key.strip() == "":
        raise ValueError("Sarvam API key is required")

    # Use appropriate voice for the language
    voice = voice_selections.get(language, "vidya")
    if show_debug:
        print(f"Using voice for {language}: {voice}")

    # Initialize TTS client
    try:
        tts_client = SarvamTTS(api_key=sarvam_api_key)
        
        if not tts_client.test_connection():
            raise ValueError("Failed to connect to Sarvam API")
        
        if show_debug:
            print("✓ Connected to Sarvam TTS API")
        
    except Exception as e:
        print(f"TTS client initialization failed: {e}")
        raise ValueError(f"Failed to initialize TTS client: {e}")

    successful_generations = 0
    
    def get_chunk_size_for_language(lang: str) -> int:
        """Determine appropriate chunk size based on language characteristics"""
        # Languages with complex scripts (Devanagari, Bengali, etc.) need smaller chunks
        complex_script_languages = ['hindi', 'bengali', 'marathi', 'nepali', 'gujarati']
        
        if lang.lower() in complex_script_languages:
            return 450  # Smaller chunks for complex scripts
        else:
            return 500  # Standard chunk size for other languages
    
    def chunk_text_by_language(text: str, language: str, max_chunk_length: int = None) -> List[str]:
        """Create chunks appropriate for the specific language"""
        if max_chunk_length is None:
            max_chunk_length = get_chunk_size_for_language(language)
            
        # For complex script languages, use grapheme-aware chunking
        complex_script_languages = ['hindi', 'bengali', 'marathi', 'nepali', 'gujarati']
        
        if language.lower() in complex_script_languages:
            # Use grapheme-aware chunking for complex scripts
            if grapheme.length(text) <= max_chunk_length:
                return [text]
            
            # Split on sentence boundaries with priority to native punctuation
            sentences = re.split(r'(?<=[।॥.!?])\s+', text)
            
            chunks = []
            current_chunk = ""
            
            for sentence in sentences:
                sentence_length = grapheme.length(sentence)
                current_length = grapheme.length(current_chunk)
                
                if current_length + sentence_length + 1 > max_chunk_length:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    
                    if sentence_length > max_chunk_length:
                        # Break long sentences at word boundaries
                        words = sentence.split()
                        temp_chunk = ""
                        for word in words:
                            word_length = grapheme.length(word)
                            temp_length = grapheme.length(temp_chunk)
                            
                            if temp_length + word_length + 1 > max_chunk_length:
                                chunks.append(temp_chunk.strip())
                                temp_chunk = word + " "
                            else:
                                temp_chunk += word + " "
                        
                        if temp_chunk:
                            current_chunk = temp_chunk
                    else:
                        current_chunk = sentence + " "
                else:
                    current_chunk += sentence + " "
            
            if current_chunk:
                chunks.append(current_chunk.strip())
            
            return chunks
        else:
            # Use standard character-based chunking for Latin script languages
            if len(text) <= max_chunk_length:
                return [text]
            
            sentences = re.split(r'(?<=[.!?])\s+', text)
            chunks = []
            current_chunk = ""
            
            for sentence in sentences:
                if len(current_chunk) + len(sentence) + 1 > max_chunk_length:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    
                    if len(sentence) > max_chunk_length:
                        # Break long sentences at word boundaries
                        words = sentence.split()
                        temp_chunk = ""
                        for word in words:
                            if len(temp_chunk) + len(word) + 1 > max_chunk_length:
                                chunks.append(temp_chunk.strip())
                                temp_chunk = word + " "
                            else:
                                temp_chunk += word + " "
                        
                        if temp_chunk:
                            current_chunk = temp_chunk
                    else:
                        current_chunk = sentence + " "
                else:
                    current_chunk += sentence + " "
            
            if current_chunk:
                chunks.append(current_chunk.strip())
            
            return chunks

    def generate_audio_from_chunks(chunks: List[str], language_code, base_filename: str) -> bool:
        """Generate audio from text chunks and combine them"""
        temp_dir = os.path.join(output_dir, "temp_chunks")
        Path(temp_dir).mkdir(exist_ok=True)
        
        chunk_files = []
        for j, chunk in enumerate(chunks):
            chunk_path = os.path.join(temp_dir, f"{base_filename}_chunk_{j:03d}.wav")
            if show_debug:
                print(f"  Processing chunk {j+1}/{len(chunks)} ({len(chunk)} chars)")
            
            try:
                audio_bytes = tts_client.synthesize_text(
                    text=chunk,
                    target_language=language_code,  # Use language code for TTS
                    voice=voice
                )
                
                if audio_bytes and len(audio_bytes) > 0:
                    with open(chunk_path, 'wb') as f:
                        f.write(audio_bytes)
                    chunk_files.append(chunk_path)
                    if show_debug:
                        print(f"  ✓ Generated audio for chunk {j+1}")
                else:
                    if show_debug:
                        print(f"  ⨯ No audio data returned for chunk {j+1}")
            except Exception as e:
                if show_debug:
                    print(f"  ⨯ Error generating audio for chunk {j+1}: {e}")
        
        if not chunk_files:
            return False
        
        # Combine chunks using ffmpeg
        final_path = os.path.join(output_dir, f"{base_filename}.wav")
        
        if len(chunk_files) == 1:
            # If only one chunk, just copy it
            import shutil
            shutil.copy(chunk_files[0], final_path)
        else:
            # Use ffmpeg to concatenate multiple chunks
            list_file = os.path.join(temp_dir, f"{base_filename}_list.txt")
            with open(list_file, 'w') as f:
                for chunk_file in chunk_files:
                    f.write(f"file '{os.path.abspath(chunk_file)}'\n")
            
            try:
                subprocess.run([
                    'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                    '-i', list_file, '-c', 'copy', final_path
                ], check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                if show_debug:
                    print(f"FFmpeg error: {e.stderr.decode() if e.stderr else e}")
                # Fallback to first chunk
                import shutil
                shutil.copy(chunk_files[0], final_path)
        
        audio_files.append(final_path)
        if show_debug:
            print(f"✓ {language} audio: {final_path}")
        return True

    try:
        # Generate title audio
        if title_intro_script and title_intro_script.strip():
            if show_debug:
                print(f"Generating {language} title audio...")
            
            cleaned_text = title_intro_script
            if cleaned_text:
                chunks = chunk_text_by_language(cleaned_text, language)
                if show_debug:
                    print(f"Processing {len(chunks)} {language} chunks for title intro")
                
                if generate_audio_from_chunks(chunks, language_code, "00_title_introduction"):
                    successful_generations += 1

        # Generate section audios
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
        
        for i, section_name in enumerate(section_order, start=1):
            if section_name in sections_scripts:
                script_text = sections_scripts[section_name]
                
                if not script_text or not script_text.strip():
                    continue

                if show_debug:
                    print(f"Generating {language} {section_name} audio...")
                
                cleaned_text = script_text
                if cleaned_text:
                    chunks = chunk_text_by_language(cleaned_text, language)
                    if show_debug:
                        print(f"Processing {len(chunks)} {language} chunks for {section_name}")
                    
                    if generate_audio_from_chunks(chunks, language_code, f"{i:02d}_{section_name.lower()}"):
                        successful_generations += 1

        if successful_generations == 0:
            raise ValueError(f"No {language} audio files were generated successfully")

        if show_debug:
            print(f"✓ Generated {successful_generations} {language} audio files")
        
        return {
            "audio_files": [Path(f).name for f in audio_files]
        }

    except Exception as e:
        print(f"{language} audio generation error: {e}")
        raise


def test_sarvam_sdk(api_key: str, voice: str = "meera"):
    """Test function for SDK validation"""
    try:
        tts_client = SarvamTTS(api_key=api_key)
        return tts_client.test_connection()
    except Exception as e:
        print(f"SDK test failed: {e}")
        return False







 
# ---------------------------
# Bhashini TTS call 
# ---------------------------
async def bhashini_tts(clean_text, gender, headers, api_url):
    data = {"text": clean_text, "gender": gender}
    print("data", data)

    async with aiohttp.ClientSession() as session:
        async with session.post(api_url, json=data, headers=headers, ssl=False) as response:
            response_text = await response.text()
            print("response", response)
            if response.status == 200:
                result = await response.json()
                url = result.get("data", {}).get("s3_url", "")
                print("url", url)
                return url
            else:
                raise HTTPException(
                    status_code=response.status,
                    detail=f"TTS API error: {response.status} - {response_text}",
                )


# ---------------------------
# Bhashini MT call 
# ---------------------------
async def bhashini_mt(clean_text, headers, api_url):
    data = {"input_text": clean_text}
    print("data", data)

    async with aiohttp.ClientSession() as session:
        async with session.post(api_url, json=data, headers=headers, ssl=False) as response:
            print("response", response)
            if response.status == 200:
                result = await response.json()
                print("NMT Result: ",result)
                return result.get("data", {}).get("output_text", "")
            else:
                error_text = await response.text()
                print("Error response body:", error_text)

                raise HTTPException(status_code=500, detail="Translation API error")


# ---------------------------
# File download helper 
# ---------------------------
async def download_audio_file(url: str, save_path: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                with open(save_path, "wb") as f:
                    f.write(await resp.read())
                return save_path
            else:
                raise Exception(f"Failed to download audio. Status: {resp.status}")


# ---------------------------
# Single audio generation task
# ---------------------------
async def generate_single_audio(
    section_name: str,
    script_text: str,
    output_path: str,
    headers: dict,
    api_url: str,
    gender: str = "male"
):
    """Generate audio for a single section"""
    try:
        if not script_text or not script_text.strip():
            return None
        
        print(f"Starting {section_name} audio generation...")
        
        cleaned_text = clean_script_for_tts_and_video(script_text)
        if not cleaned_text:
            return None
            
        audio_url = await bhashini_tts(cleaned_text, gender, headers, api_url)
        if audio_url:
            await download_audio_file(audio_url, output_path)
            print(f"✓ {section_name} audio completed: {output_path}")
            return output_path
        
        return None
        
    except Exception as e:
        print(f"✗ Error generating {section_name} audio: {e}")
        return None


# ---------------------------
# Parallel audio generation
# ---------------------------
async def ensure_audio_is_generated_bhashini(
    language: str,
    gender: str,
    headers,
    api_url: str,
    paper_id: str,
    title_intro_script: str,
    sections_scripts: Dict[str, str],
):
    """Generate audio files in parallel for faster processing"""

    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Load config (same as before)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")

    api_url_from_config = None
    access_token = None
    print("language", language)
    with open(MODEL_PATH, "r") as f:
        data = json.load(f)

    if isinstance(data, list):
        for item in data:
            if (
                item.get("model_type") == "tts"
                and item.get("source_language") == language
            ):
                api_url_from_config = item.get("api_url")
                access_token = item.get("access_token")

    if not api_url_from_config or not access_token:
        raise ValueError("No valid TTS model found in models.json")

    headers = {"access-token": access_token}
    final_api_url = api_url or api_url_from_config

    # Prepare all tasks for parallel execution
    tasks = []
    
    # Title audio task
    if title_intro_script and title_intro_script.strip():
        title_audio_path = os.path.join(output_dir, "00_title_introduction.wav")
        tasks.append(
            generate_single_audio(
                "Title Introduction",
                title_intro_script,
                title_audio_path,
                headers,
                final_api_url,
                gender
            )
        )

    # Section audio tasks
    section_order = [
        "Introduction",
        "Methodology", 
        "Results",
        "Discussion",
        "Conclusion",
    ]

    for i, section_name in enumerate(section_order, start=1):
        if section_name in sections_scripts:
            script_text = sections_scripts[section_name]
            if script_text and script_text.strip():
                audio_path = os.path.join(
                    output_dir, f"{i:02d}_{section_name.lower()}.wav"
                )
                tasks.append(
                    generate_single_audio(
                        section_name,
                        script_text,
                        audio_path,
                        headers,
                        final_api_url,
                        gender
                    )
                )

    if not tasks:
        raise ValueError("No valid scripts found for audio generation")

    print(f"Starting parallel generation of {len(tasks)} audio files...")
    
    # Execute all tasks in parallel
    # start_time = time.time()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    # end_time = time.time()

    # Process results
    successful_files = []
    failed_generations = []

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            failed_generations.append(f"Task {i}: {result}")
        elif result is not None:
            successful_files.append(result)

    if failed_generations:
        print("Some audio generations failed:")
        for failure in failed_generations:
            print(f"  - {failure}")

    if not successful_files:
        raise ValueError("No audio files were generated successfully")

    print(f"✓ Generated {len(successful_files)} audio files ")
    # print(f"✓ Generated {len(successful_files)} audio files in {end_time - start_time:.2f} seconds")
    
    return {
        "audio_files": [Path(f).name for f in successful_files],
        "successful_count": len(successful_files),
        "failed_count": len(failed_generations),
        # "generation_time": end_time - start_time
    }


# ---------------------------
# Alternative with concurrency limit
# ---------------------------
async def ensure_audio_is_generated_bhashini_parallel_limited(
    language: str,
    gender: str,
    headers,
    api_url: str,
    paper_id: str,
    title_intro_script: str,
    sections_scripts: Dict[str, str],
    max_concurrent: int = 3  # Limit concurrent requests to avoid overwhelming the API
):
    """Generate audio files in parallel with concurrency limit"""

    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Load config (same as before)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")

    api_url_from_config = None
    access_token = None
    
    with open(MODEL_PATH, "r") as f:
        data = json.load(f)

    if isinstance(data, list):
        for item in data:
            if (
                item.get("model_type") == "tts"
                and item.get("source_language") == "English"
            ):
                api_url_from_config = item.get("api_url")
                access_token = item.get("access_token")

    if not api_url_from_config or not access_token:
        raise ValueError("No valid TTS model found in models.json")

    headers = {"access-token": access_token}
    final_api_url = api_url or api_url_from_config

    # Create semaphore for limiting concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)

    async def generate_with_semaphore(section_name, script_text, output_path):
        async with semaphore:
            return await generate_single_audio(
                section_name, script_text, output_path, headers, final_api_url, gender
            )

    # Prepare all tasks
    tasks = []
    
    # Title audio task
    if title_intro_script and title_intro_script.strip():
        title_audio_path = os.path.join(output_dir, "00_title_introduction.wav")
        tasks.append(
            generate_with_semaphore(
                "Title Introduction",
                title_intro_script,
                title_audio_path
            )
        )

    # Section audio tasks
    section_order = [
        "Introduction",
        "Methodology", 
        "Results",
        "Discussion",
        "Conclusion",
    ]

    for i, section_name in enumerate(section_order, start=1):
        if section_name in sections_scripts:
            script_text = sections_scripts[section_name]
            if script_text and script_text.strip():
                audio_path = os.path.join(
                    output_dir, f"{i:02d}_{section_name.lower()}.wav"
                )
                tasks.append(
                    generate_with_semaphore(
                        section_name,
                        script_text,
                        audio_path
                    )
                )

    if not tasks:
        raise ValueError("No valid scripts found for audio generation")

    print(f"Starting parallel generation of {len(tasks)} audio files (max {max_concurrent} concurrent)...")
    
    # Execute all tasks in parallel with concurrency limit
    start_time = time.time()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    end_time = time.time()

    # Process results (same as before)
    successful_files = []
    failed_generations = []

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            failed_generations.append(f"Task {i}: {result}")
        elif result is not None:
            successful_files.append(result)

    if failed_generations:
        print("Some audio generations failed:")
        for failure in failed_generations:
            print(f"  - {failure}")

    if not successful_files:
        raise ValueError("No audio files were generated successfully")

    print(f"✓ Generated {len(successful_files)} audio files in {end_time - start_time:.2f} seconds")
    
    return {
        "audio_files": [Path(f).name for f in successful_files],
        "successful_count": len(successful_files),
        "failed_count": len(failed_generations),
        "generation_time": end_time - start_time
    }

# -------------------------------------------
# Reels audio generation using Bhashini TTS
# -------------------------------------------

async def generate_dialogue_audio_bhashini(
    language: str,
    paper_id: str,
    dialogue_script: List[Dict[str, str]]   # expects a list of {"character": "...", "dialogue": "..."}
):
    """
    Generates audio files for a dialogue script in parallel using Bhashini TTS.
    
    Args:
        language (str): The target language (e.g., 'Hindi', 'English').
        paper_id (str): The unique ID for the paper to create a dedicated folder.
        dialogue_script (List[Dict[str, str]]): The structured dialogue script.
    
    Returns:
        Dict: A dictionary containing the list of generated audio file names.
    """
    print("Starting dialogue audio generation for reel...")
    output_dir = f"temp/audio/{paper_id}"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")
    api_url_from_config = None
    access_token = None

    try:
        with open(MODEL_PATH, "r", encoding='utf-8') as f:
            data = json.load(f)
        
        # Find the correct TTS model configuration from models.json
        for item in data:
            if item.get("model_type") == "tts" and item.get("source_language") == language:
                api_url_from_config = item.get("api_url")
                access_token = item.get("access_token")
                break # Stop once we find the matching model
    except Exception as e:
        raise ValueError(f"Could not load or parse models.json: {e}")

    if not api_url_from_config or not access_token:
        raise ValueError(f"No valid TTS model found for language '{language}' in models.json")

    headers = {"access-token": access_token}
    
    tasks = []
    for index, turn in enumerate(dialogue_script):
        character = turn.get("character")
        dialogue = turn.get("dialogue")

        if not character or not dialogue or not dialogue.strip():
            print(f"Skipping turn {index} due to missing character or dialogue.")
            continue
        
        # fixing the gender of the characters
        gender = "male" if character.upper() == "K" else "female"
        
        # Create a sequential, zero-padded filename for easy sorting
        audio_filename = f"{index:02d}_{character}.wav"
        output_path = os.path.join(output_dir, audio_filename)
        
        tasks.append(
            generate_single_audio(
                section_name=f"Turn {index} ({character})",
                script_text=dialogue,
                output_path=output_path,
                headers=headers,
                api_url=api_url_from_config,
                gender=gender
            )
        )

    if not tasks:
        raise ValueError("Dialogue script empty/invalid. No audio to generate.")

    print(f"Starting parallel generation of {len(tasks)} dialogue audio files...")
    
    results = await asyncio.gather(*tasks, return_exceptions=True)

    successful_files = []
    for result in results:
        if isinstance(result, Exception):
            print(f"A task failed with an exception: {result}")
        elif result is not None:
            successful_files.append(result)

    if not successful_files:
        raise ValueError("No audio files were generated successfully for the dialogue.")

    print(f"Generated {len(successful_files)} audio files for the dialogue.")
    
    return {
        "audio_files": [Path(f).name for f in successful_files]
    }