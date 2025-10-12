from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
import os
import fitz  # PyMuPDF for PDF text extraction
import re
import google.generativeai as genai
from sarvamai import SarvamAI
import tempfile

router = APIRouter()

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text content from a PDF file using PyMuPDF."""
    try:
        # Open the PDF
        doc = fitz.open(pdf_path)
        text_content = ""
        
        # Extract text from each page
        for page_num in range(len(doc)):
            page = doc[page_num]
            text_content += page.get_text()
            text_content += "\n\n"  # Add page breaks
        
        doc.close()
        return text_content.strip()
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting text from PDF: {str(e)}")

def clean_text(text: str) -> str:
    """Clean and normalize text content."""
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove special characters that might interfere with processing
    text = re.sub(r'[^\w\s\.,;:!?()-]', '', text)
    
    # Normalize quotes and dashes
    text = text.replace('"', '"').replace('"', '"')
    text = text.replace(''', "'").replace(''', "'")
    text = text.replace('–', '-').replace('—', '-')
    
    return text.strip()

def generate_podcast_with_gemini(api_key: str, paper_text: str) -> str:
    """Generate podcast dialogue using Gemini API with Sarvam AI fallback."""
    try:
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        system_prompt = """
            You are a skilled podcast scriptwriter and science communicator, writing for a conversational audio format.

            Your task is to generate a lively, natural, and engaging podcast dialogue between two speakers — 
            Aisha and Rohan — as they discuss and explain a given research paper to a general audience.

             Dialogue Requirements:
            - Generate a substantial dialogue with at least 25-35 exchanges between speakers
            - No individual dialogue line should exceed 50 words
            - Use alternating lines with clear speaker tags (Aisha:, Rohan:)
            - Keep the flow conversational and human-like, not robotic or overly formal
            - Make the tone warm, curious, and enthusiastic
            - Use **strategic punctuation** to shape voice and rhythm:
            - Use commas and ellipses (…) for natural pauses and hesitations.
            - Use dashes (—) to indicate shifts in thought or excitement.
            - Use exclamation marks sparingly, for genuine enthusiasm.
            - Vary sentence length to create a natural tempo.
            - Use question marks often to keep it interactive.
            - Avoid long, complex sentences; prefer short, spoken-style phrasing.

             Content Guidelines:
            - Explain technical terms simply and naturally
            - Highlight motivation, methods, results, and implications clearly
            - Break complex ideas into digestible bits, with analogies and examples
            - Include small interruptions, clarifications, and reactions between speakers
            - Begin with a friendly introduction and end with a brief, reflective wrap-up
            - Cover the paper comprehensively - don't rush through topics
            - Output **only the dialogue text** (no narration or stage directions)

             Output Example:
            Aisha: Hey Rohan, did you get a chance to read that new paper on quantum dots?
            Rohan: Oh, absolutely! It’s fascinating — especially how they managed to stabilize those tiny structures...
            Aisha: Right?! And the implications for solar energy... just incredible.

        """

        # Prepare the prompt
        prompt = f"""
{system_prompt}

            Here is the research paper content to discuss:

            {paper_text[:8000]}  # Limit text to avoid token limits

            Please generate an engaging podcast dialogue between Aisha and Rohan discussing this research paper. 

            The dialogue should be substantial - aim for at least 25-35 exchanges between the speakers to create a comprehensive discussion of the paper. Each speaker turn should be meaningful and contribute to explaining the research thoroughly.
            """

        # Generate response
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.8,
                top_p=0.9,
                max_output_tokens=6000,
            )
        )
        
        # Extract and clean the generated text
        dialogue = response.text
        
        # Remove any thinking tags if present
        dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
        
        print(f"✅ Successfully generated dialogue with Gemini (length: {len(dialogue)} characters)")
        return dialogue
        
    except Exception as gemini_error:
        print(f"❌ Gemini failed: {str(gemini_error)}")
        
        # Check if it's a quota/rate limit error
        if "429" in str(gemini_error) or "quota" in str(gemini_error).lower() or "rate limit" in str(gemini_error).lower():
            print("🔄 Falling back to Sarvam AI...")
            
            try:
                # Get Sarvam API key
                sarvam_api_key = os.getenv("SARVAM_API_KEY")
                if not sarvam_api_key:
                    raise Exception("SARVAM_API_KEY environment variable not set for fallback")
                
                # Use Sarvam AI as fallback
                client = SarvamAI(api_subscription_key=sarvam_api_key)
                
                # Extract system prompt from above for reuse
                system_prompt_clean = """You are a skilled podcast scriptwriter and science communicator, writing for a conversational audio format.

                Your task is to generate a lively, natural, and engaging podcast dialogue between two speakers — 
                Aisha and Rohan — as they discuss and explain a given research paper to a general audience.

                Dialogue Requirements:
                - Generate a substantial dialogue with at least 25-35 exchanges between speakers
                - No individual dialogue line should exceed 50 words
                - Use alternating lines with clear speaker tags (Aisha:, Rohan:)
                - Keep the flow conversational and human-like, not robotic or overly formal
                - Make the tone warm, curious, and enthusiastic
                - Use **strategic punctuation** to shape voice and rhythm:
                - Use commas and ellipses (…) for natural pauses and hesitations
                - Use dashes (—) to indicate shifts in thought or excitement
                - Use exclamation marks sparingly, for genuine enthusiasm
                - Vary sentence length to create a natural tempo
                - Use question marks often to keep it interactive
                - Avoid long, complex sentences; prefer short, spoken-style phrasing

                Content Guidelines:
                - Explain technical terms simply and naturally
                - Highlight motivation, methods, results, and implications clearly
                - Break complex ideas into digestible bits, with analogies and examples
                - Include small interruptions, clarifications, and reactions between speakers
                - Begin with a friendly introduction and end with a brief, reflective wrap-up
                - Cover the paper comprehensively - don't rush through topics
                - Output **only the dialogue text** (no narration or stage directions)

                Output Example:
                Aisha: Hey Rohan, did you get a chance to read that new paper on quantum dots?
                Rohan: Oh, absolutely! It's fascinating — especially how they managed to stabilize those tiny structures...
                Aisha: Right?! And the implications for solar energy... just incredible."""
                                
                user_prompt = f"""
                    Here is the research paper content to discuss:

                    {paper_text[:8000]}

                    Please generate an engaging podcast dialogue between Aisha and Rohan discussing this research paper. 

                    The dialogue should be substantial - aim for at least 20-30 exchanges between the speakers to create a comprehensive discussion of the paper. Each speaker turn should be meaningful and contribute to explaining the research thoroughly.
                    """
                
                res = client.chat.completions(
                    messages=[
                        {"content": system_prompt_clean, "role": "system"}, 
                        {"content": user_prompt, "role": "user"}
                    ],
                    max_tokens=15000,
                )
                
                dialogue = res.choices[0].message.content
                
                # Remove any thinking tags if present
                dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
                
                print(f"✅ Successfully generated dialogue with Sarvam AI (fallback) (length: {len(dialogue)} characters)")
                return dialogue
                
            except Exception as sarvam_error:
                print(f"❌ Sarvam AI fallback also failed: {str(sarvam_error)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Both Gemini and Sarvam AI failed. Gemini: {str(gemini_error)}. Sarvam: {str(sarvam_error)}"
                )
        else:
            # For non-quota errors, just raise the original Gemini error
            raise HTTPException(status_code=500, detail=f"Error generating podcast with Gemini: {str(gemini_error)}")


def translate_dialogues_to_hindi(dialogue: str) -> str:
    """Translate English dialogue to Hindi using AnuvaadHub API."""
    try:
        import requests
        import urllib3
        
        # Disable SSL warnings when verification is disabled
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        apiEndpoint = "https://canvas.iiit.ac.in/sandboxbeprod/check_model_status_and_infer/67b86729b5cc0eb92316383c"
        apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjhlYTNmMmRiOTNlM2JlYzkwMWZkODVkIiwicm9sZSI6Im1lZ2F0aG9uX3N0dWRlbnQifQ.uU9rXmgKjGgCPAZasrIp5x-G1NgScc-jlXP89sNVIEk"
        
        headers = {
            "Content-Type": "application/json",
            "access-token": apiToken
        }
        
        # Split dialogue into lines for translation
        lines = dialogue.split('\n')
        translated_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                translated_lines.append('')
                continue
                
            # Check if line contains speaker dialogue
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                speaker_name = line.split(':')[0].strip()
                content = ':'.join(line.split(':')[1:]).strip()
                
                if content:
                    try:
                        # Translate the content
                        body = {"input_text": content}
                        # Disable SSL verification to avoid certificate issues
                        response = requests.post(
                            apiEndpoint, 
                            headers=headers, 
                            json=body, 
                            timeout=30,
                            verify=False  # Disable SSL verification
                        )
                        
                        if response.status_code == 200:
                            response_data = response.json()
                            if response_data.get('status') == 'success':
                                translated_content = response_data['data']['output_text']
                                translated_lines.append(f"{speaker_name}: {translated_content}")
                                print(f"✅ Translated: {content[:30]}... -> {translated_content[:30]}...")
                            else:
                                print(f"Translation API error: {response_data.get('message', 'Unknown error')}")
                                translated_lines.append(line)  # Keep original if translation fails
                        else:
                            print(f"Translation API HTTP error: {response.status_code} - {response.text}")
                            translated_lines.append(line)  # Keep original if translation fails
                            
                    except requests.exceptions.SSLError as e:
                        print(f"SSL Error during translation: {str(e)}")
                        print("Skipping translation for this segment due to SSL issues")
                        translated_lines.append(line)  # Keep original if SSL fails
                    except requests.exceptions.RequestException as e:
                        print(f"Translation request error: {str(e)}")
                        translated_lines.append(line)  # Keep original if translation fails
                    except Exception as e:
                        print(f"Unexpected error during translation: {str(e)}")
                        translated_lines.append(line)  # Keep original if any other error occurs
                else:
                    translated_lines.append(line)
            else:
                translated_lines.append(line)
        
        translated_dialogue = '\n'.join(translated_lines)
        print(f"✅ Successfully translated dialogue to Hindi")
        return translated_dialogue
        
    except Exception as e:
        print(f"❌ Error translating dialogue to Hindi: {str(e)}")
        return dialogue  # Return original dialogue if translation fails completely
def translate_dialogues_to_tamil(dialogue: str) -> str:
    """Translate English dialogue to Tamil using AnuvaadHub API."""
    try:
        import requests
        import urllib3
        
        # Disable SSL warnings when verification is disabled
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        apiEndpoint = "https://canvas.iiit.ac.in/sandboxbeprod/check_model_status_and_infer/6872172f4f34535ffa89b90e"
        apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjhlYTNmMmRiOTNlM2JlYzkwMWZkODVkIiwicm9sZSI6Im1lZ2F0aG9uX3N0dWRlbnQifQ.uU9rXmgKjGgCPAZasrIp5x-G1NgScc-jlXP89sNVIEk"
        
        headers = {
            "Content-Type": "application/json",
            "access-token": apiToken
        }
        
        # Split dialogue into lines for translation
        lines = dialogue.split('\n')
        translated_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                translated_lines.append('')
                continue
                
            # Check if line contains speaker dialogue
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                speaker_name = line.split(':')[0].strip()
                content = ':'.join(line.split(':')[1:]).strip()
                
                if content:
                    try:
                        # Translate the content
                        body = {"input_text": content}
                        # Disable SSL verification to avoid certificate issues
                        response = requests.post(
                            apiEndpoint, 
                            headers=headers, 
                            json=body, 
                            timeout=30,
                            verify=False  # Disable SSL verification
                        )
                        
                        if response.status_code == 200:
                            response_data = response.json()
                            if response_data.get('status') == 'success':
                                translated_content = response_data['data']['output_text']
                                translated_lines.append(f"{speaker_name}: {translated_content}")
                                print(f"✅ Translated: {content[:30]}... -> {translated_content[:30]}...")
                            else:
                                print(f"Translation API error: {response_data.get('message', 'Unknown error')}")
                                translated_lines.append(line)  # Keep original if translation fails
                        else:
                            print(f"Translation API HTTP error: {response.status_code} - {response.text}")
                            translated_lines.append(line)  # Keep original if translation fails
                            
                    except requests.exceptions.SSLError as e:
                        print(f"SSL Error during translation: {str(e)}")
                        print("Skipping translation for this segment due to SSL issues")
                        translated_lines.append(line)  # Keep original if SSL fails
                    except requests.exceptions.RequestException as e:
                        print(f"Translation request error: {str(e)}")
                        translated_lines.append(line)  # Keep original if translation fails
                    except Exception as e:
                        print(f"Unexpected error during translation: {str(e)}")
                        translated_lines.append(line)  # Keep original if any other error occurs
                else:
                    translated_lines.append(line)
            else:
                translated_lines.append(line)
        
        translated_dialogue = '\n'.join(translated_lines)
        print(f"✅ Successfully translated dialogue to Tamil")
        return translated_dialogue
        
    except Exception as e:
        print(f"❌ Error translating dialogue to Tamil: {str(e)}")
        return dialogue  # Return original dialogue if translation fails completely

def get_audio_clips(dialogue: str, language: str = "english") -> list:
    """Generate audio clips for each speaker's dialogue using Sarvam AI TTS."""
    try:
        # Get Sarvam API key
        sarvam_api_key = os.getenv("SARVAM_API_KEY")
        if not sarvam_api_key:
            raise HTTPException(status_code=400, detail="SARVAM_API_KEY environment variable not set")
        
        client = SarvamAI(api_subscription_key=sarvam_api_key)
        
        # Create output directory
        os.makedirs("gen", exist_ok=True)
        
        # Parse dialogue into speaker segments
        lines = dialogue.split('\n')
        audio_files = []
        segment_count = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if line starts with speaker name
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                speaker_name = line.split(':')[0].strip()
                content = ':'.join(line.split(':')[1:]).strip()
                
                if not content:
                    continue
                
                # Choose voice and language based on speaker and language preference
                if language.lower() == "hindi":
                    target_language_code = "hi-IN"
                    if speaker_name.lower() == 'aisha':
                        speaker_voice = "manisha"  # Hindi female voice
                    elif speaker_name.lower() == 'rohan':
                        speaker_voice = "karun"  # Hindi male voice
                    else:
                        speaker_voice = "manisha"  # default
                elif language.lower() == "tamil":
                    target_language_code = "ta-IN"
                    if speaker_name.lower() == 'aisha':
                        speaker_voice = "manisha"  # Tamil female voice
                    elif speaker_name.lower() == 'rohan':
                        speaker_voice = "karun"  # Tamil male voice
                    else:
                        speaker_voice = "manisha"  # default
                else:
                    target_language_code = "en-IN"
                    if speaker_name.lower() == 'aisha':
                        speaker_voice = "manisha"
                    elif speaker_name.lower() == 'rohan':
                        speaker_voice = "karun"
                    else:
                        speaker_voice = "manisha"  # default
                
                try:
                    # Generate audio using Sarvam AI
                    print(f"Generating audio for {speaker_name}: {content[:50]}...")
                    
                    response = client.text_to_speech.convert(
                        text=content,
                        target_language_code=target_language_code,
                        speaker=speaker_voice,
                        pitch=-0.2,
                        pace=1.1,
                        loudness=1.0,
                        speech_sample_rate=22050,
                        enable_preprocessing=True,
                        model="bulbul:v2"
                    )
                    
                    # Save audio file
                    segment_count += 1
                    filename = f"segment_{segment_count:03d}_{speaker_name.lower()}.wav"
                    file_path = os.path.join("gen", filename)
                    
                    # Get the first audio from the response (base64 encoded)
                    if response.audios and len(response.audios) > 0:
                        import base64
                        audio_data = base64.b64decode(response.audios[0])
                        
                        # Write audio data to file
                        with open(file_path, "wb") as f:
                            f.write(audio_data)
                        
                        audio_files.append({
                            "segment": segment_count,
                            "speaker": speaker_name,
                            "text": content,
                            "file_path": file_path,
                            "filename": filename
                        })
                        
                        print(f"✅ Saved: {filename}")
                    else:
                        print(f"❌ No audio data received for {speaker_name}")
                        continue
                    
                except Exception as e:
                    print(f"❌ Error generating audio for {speaker_name}: {str(e)}")
                    # Continue with next segment even if one fails
                    continue
        
        return audio_files
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating audio clips: {str(e)}")


def combine_audio_clips(audio_files: list, output_filename: str = "podcast_full.wav") -> str:
    """Combine individual audio clips into a single podcast file and delete individual files."""
    try:
        if not audio_files:
            raise Exception("No audio files to combine")
        
        combined_file_path = os.path.join("gen", output_filename)
        
        try:
            # Try to use pydub for audio processing
            from pydub import AudioSegment
            
            print("🔧 Combining audio clips...")
            combined = AudioSegment.empty()
            
            for i, audio_file in enumerate(audio_files):
                file_path = audio_file["file_path"]
                
                if os.path.exists(file_path):
                    try:
                        # Load audio segment
                        audio = AudioSegment.from_wav(file_path)
                        
                        # Add to combined audio
                        combined += audio
                        
                        # Add a short pause between speakers (500ms)
                        if i < len(audio_files) - 1:  # Don't add pause after last segment
                            combined += AudioSegment.silent(duration=500)
                        
                        print(f"✅ Added segment {i+1}/{len(audio_files)}")
                        
                    except Exception as e:
                        print(f"❌ Error processing {file_path}: {str(e)}")
                        continue
                else:
                    print(f"❌ File not found: {file_path}")
            
            # Export combined audio
            combined.export(combined_file_path, format="wav")
            print(f"🎵 Combined audio saved as: {combined_file_path}")
            
            # Clean up individual files
            cleanup_temp_files(audio_files)
            
            return combined_file_path
            
        except ImportError:
            # Fallback: use ffmpeg if pydub is not available
            print("⚠️  pydub not available, trying ffmpeg...")
            return combine_with_ffmpeg(audio_files, combined_file_path)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error combining audio clips: {str(e)}")


def combine_with_ffmpeg(audio_files: list, output_path: str) -> str:
    """Fallback method to combine audio using ffmpeg."""
    try:
        import subprocess
        
        # Create a temporary file list for ffmpeg
        file_list_path = os.path.join("gen", "file_list.txt")
        
        with open(file_list_path, "w") as f:
            for audio_file in audio_files:
                if os.path.exists(audio_file["file_path"]):
                    f.write(f"file '{os.path.abspath(audio_file['file_path'])}'\n")
        
        # Use ffmpeg to concatenate
        cmd = [
            "ffmpeg", "-f", "concat", "-safe", "0", 
            "-i", file_list_path, "-c", "copy", output_path, "-y"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"🎵 Combined audio saved with ffmpeg: {output_path}")
            
            # Clean up
            os.remove(file_list_path)
            cleanup_temp_files(audio_files)
            
            return output_path
        else:
            raise Exception(f"ffmpeg failed: {result.stderr}")
            
    except FileNotFoundError:
        # ffmpeg not available, create a simple concatenation
        return simple_binary_concat(audio_files, output_path)
    except Exception as e:
        raise Exception(f"ffmpeg combination failed: {str(e)}")


def simple_binary_concat(audio_files: list, output_path: str) -> str:
    """Simple binary concatenation as last resort."""
    try:
        print("⚠️  Using simple binary concatenation (audio quality may be affected)")
        
        with open(output_path, "wb") as outfile:
            for audio_file in audio_files:
                file_path = audio_file["file_path"]
                if os.path.exists(file_path):
                    with open(file_path, "rb") as infile:
                        # Skip WAV header for all but first file
                        if outfile.tell() > 0:
                            infile.seek(44)  # Skip 44-byte WAV header
                        outfile.write(infile.read())
        
        print(f"📝 Simple concatenation saved: {output_path}")
        cleanup_temp_files(audio_files)
        return output_path
        
    except Exception as e:
        raise Exception(f"Simple concatenation failed: {str(e)}")


def cleanup_temp_files(audio_files: list):
    """Delete individual audio files after combining."""
    try:
        print("🧹 Cleaning up temporary files...")
        deleted_count = 0
        
        for audio_file in audio_files:
            file_path = audio_file["file_path"]
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"🗑️  Deleted: {audio_file['filename']}")
            except Exception as e:
                print(f"❌ Error deleting {file_path}: {str(e)}")
        
        print(f"✅ Cleaned up {deleted_count} temporary files")
        
    except Exception as e:
        print(f"⚠️  Cleanup warning: {str(e)}")


def get_audio_file_info(combined_file_path: str) -> dict:
    """Get information about the combined audio file."""
    try:
        if not os.path.exists(combined_file_path):
            return {"error": "Combined file not found"}
        
        file_size = os.path.getsize(combined_file_path)
        
        # Try to get duration using pydub
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_wav(combined_file_path)
            duration_ms = len(audio)
            duration_seconds = duration_ms / 1000
            
            return {
                "file_size_bytes": file_size,
                "file_size_mb": round(file_size / (1024 * 1024), 2),
                "duration_seconds": round(duration_seconds, 2),
                "duration_minutes": round(duration_seconds / 60, 2),
                "sample_rate": audio.frame_rate,
                "channels": audio.channels
            }
        except ImportError:
            return {
                "file_size_bytes": file_size,
                "file_size_mb": round(file_size / (1024 * 1024), 2),
                "note": "Install pydub for detailed audio info"
            }
            
    except Exception as e:
        return {"error": f"Error getting file info: {str(e)}"}



def save_dialogue_to_file(dialogue: str, paper_id: str = None) -> str:
    
    """Save the generated dialogue to a file."""
    try:
        # Create filename
        if paper_id:
            filename = f"podcast_dialogue_{paper_id}.txt"
        else:
            filename = "podcast_dialogue.txt"
        
        # Ensure directory exists
        os.makedirs("temp/podcasts", exist_ok=True)
        
        # Full file path
        file_path = os.path.join("temp/podcasts", filename)
        
        # Write dialogue to file
        with open(file_path, "w", encoding='utf-8') as f:
            f.write(dialogue)
        
        return file_path
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving dialogue to file: {str(e)}")

def extract_speakers_and_content(dialogue: str) -> dict:
    """Extract speaker-specific content and statistics from dialogue."""
    try:
        lines = dialogue.split('\n')
        speakers = {}
        current_speaker = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if line starts with speaker name
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                speaker_name = line.split(':')[0].strip()
                content = ':'.join(line.split(':')[1:]).strip()
                
                if speaker_name not in speakers:
                    speakers[speaker_name] = []
                    
                speakers[speaker_name].append(content)
                current_speaker = speaker_name
                
            elif current_speaker and line:
                # Continue previous speaker's content
                speakers[current_speaker][-1] += ' ' + line
        
        # Calculate statistics
        stats = {}
        for speaker, content_list in speakers.items():
            total_words = sum(len(content.split()) for content in content_list)
            stats[speaker] = {
                'turns': len(content_list),
                'total_words': total_words,
                'avg_words_per_turn': total_words / len(content_list) if content_list else 0
            }
        
        return {
            'speakers': speakers,
            'statistics': stats,
            'total_turns': sum(stats[s]['turns'] for s in stats),
            'total_words': sum(stats[s]['total_words'] for s in stats)
        }
        
    except Exception as e:
        return {'error': f"Error analyzing dialogue: {str(e)}"}

@router.post("/get_podcast")
async def get_podcast(file: UploadFile = File(...), language: str = Form("english")):
    """Generate a podcast dialogue from an uploaded PDF using Gemini AI and create audio clips."""
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Validate language selection
    if language.lower() not in ["english", "hindi", "tamil"]:
        raise HTTPException(status_code=400, detail="Language must be 'english', 'hindi', or 'tamil'")
    
    print(f"Generating podcast in {language} language...")
    
    # Get API keys from environment variables
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY environment variable not set")
    
    sarvam_api_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_api_key:
        raise HTTPException(status_code=400, detail="SARVAM_API_KEY environment variable not set")
    
    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_pdf_path = temp_file.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving uploaded file: {str(e)}")
    
    try:
        # Extract text from the uploaded PDF
        print(f"Extracting text from uploaded PDF: {file.filename}")
        paper_text = extract_text_from_pdf(temp_pdf_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Insufficient text extracted from PDF")
        
        # Clean the extracted text
        paper_text = clean_text(paper_text)
        
        # Generate podcast dialogue using Gemini
        print("Generating podcast dialogue with Gemini...")
        podcast_dialogue = generate_podcast_with_gemini(gemini_api_key, paper_text)
        
        # Translate to Hindi or Tamil if requested
        if language.lower() == "hindi":
            print("Translating dialogue to Hindi...")
            podcast_dialogue = translate_dialogues_to_hindi(podcast_dialogue)
        elif language.lower() == "tamil":
            print("Translating dialogue to Tamil...")
            podcast_dialogue = translate_dialogues_to_tamil(podcast_dialogue)
        
        # Save dialogue to file
        paper_name = os.path.splitext(file.filename)[0]
        saved_file_path = save_dialogue_to_file(podcast_dialogue, paper_name)
        
        # Analyze dialogue content
        dialogue_analysis = extract_speakers_and_content(podcast_dialogue)
        
        # Generate audio clips for each dialogue segment
        print("Generating audio clips...")
        audio_files = get_audio_clips(podcast_dialogue, language)
        
        # Combine audio clips into single podcast file
        print("Combining audio clips...")
        combined_audio_path = combine_audio_clips(audio_files)
        
        # Get information about the final audio file
        audio_info = get_audio_file_info(combined_audio_path)
        
        print("Podcast dialogue and audio generated successfully!")
        
        return {
            "success": True,
            "uploaded_file": file.filename,
            "language": language,
            "paper_text_length": len(paper_text),
            "dialogue_length": len(podcast_dialogue),
            "dialogue": podcast_dialogue,
            "saved_file": saved_file_path,
            "analysis": dialogue_analysis,
            "total_audio_segments": len(audio_files),
            "combined_audio_path": combined_audio_path,
            "audio_filename": os.path.basename(combined_audio_path),
            "audio_info": audio_info,
            "message": f"Podcast generated successfully in {language}! Combined {len(audio_files)} audio segments into {os.path.basename(combined_audio_path)}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating podcast: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating podcast: {str(e)}")
    finally:
        # Clean up temporary file
        try:
            if os.path.exists(temp_pdf_path):
                os.unlink(temp_pdf_path)
        except Exception as e:
            print(f"Warning: Could not delete temporary file {temp_pdf_path}: {str(e)}")

@router.get("/download_audio/{filename}")
async def download_podcast_audio(filename: str):
    """Download generated podcast audio file."""
    try:
        # Validate filename to prevent directory traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        file_path = os.path.join("gen", filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        return FileResponse(
            path=file_path,
            media_type="audio/wav",
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving audio file: {str(e)}")

@router.get("/stream_audio/{filename}")
async def stream_podcast_audio(filename: str):
    """Stream generated podcast audio file."""
    try:
        # Validate filename to prevent directory traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        file_path = os.path.join("gen", filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        return FileResponse(
            path=file_path,
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error streaming audio file: {str(e)}")
