# In backend/app/services/podcast_service.py

import os
import subprocess
import json
import requests
import google.generativeai as genai
import time 
from app.routes.papers import papers_storage
from app.services.sarvam_sdk import SarvamTTS, SarvamTTSError


def chunk_text_by_word_count(text: str, max_words: int = 30):
    """
    Splits a string of text into chunks of a maximum word count.
    """
    words = text.split()
    for i in range(0, len(words), max_words):
        yield ' '.join(words[i:i + max_words])

def setup_podcast_directory(paper_id: str):
    """
    Creates the necessary directory structure for a new podcast task.
    """
    base_dir = os.path.join("temp", paper_id, "podcast")
    segments_dir = os.path.join(base_dir, "segments")
    
    os.makedirs(segments_dir, exist_ok=True)
    
    return {
        "base": base_dir,
        "segments": segments_dir,
        "summary_file": os.path.join(base_dir, "summary.txt"),
        "script_file": os.path.join(base_dir, "script.json"),
        "final_podcast": os.path.join(base_dir, f"podcast_{paper_id}.mp3")
    }

# Load API keys from environment variables
API_KEY = os.getenv("GOOGLE_API_KEY")

def generate_structured_summary(paper_text: str) -> str:
    """
    Phase 1: Uses the Gemini API to generate a structured, thematic summary
    of the research paper.
    """
    if not API_KEY:
        raise ValueError("Google API Key not found. Please set it in your .env file.")
        
    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')

    prompt_template = f"""
    You are an expert research analyst. Your task is to distill the provided research paper into a structured summary suitable for generating a podcast script. The output MUST be in the following format, with clear headings:

    **Title:**
    **Key Insight:** [A single, compelling sentence that captures the core finding.]
    **Introduction:**
    - [Point 1]
    - [Point 2]
    **Methodology:**
    - [Point 1]
    - [Point 2]
    **Key Findings:**
    - [Finding 1: A clear statement of a major result.]
    - [Finding 2: Another significant result.]
    **Conclusion:**
    - [Point 1]
    - [Point 2]

    Here is the research paper text:
    ---
    {paper_text}
    ---
    """
    
    try:
        print("--- Generating structured summary... ---")
        response = model.generate_content(prompt_template)
        print("--- Summary generated successfully. ---")
        return response.text
    except Exception as e:
        print(f"Error generating structured summary with Gemini: {e}")
        raise

def generate_dialogue_script(summary: str) -> list:
    """
    Phase 2: Uses the Gemini API with persona prompting to convert the
    structured summary into a JSON dialogue script.
    """
    if not API_KEY:
        raise ValueError("Google API Key not found. Please set it in your .env file.")

    genai.configure(api_key=API_KEY)
    
    model = genai.GenerativeModel(
        'gemini-1.5-flash',
        generation_config={"response_mime_type": "application/json"}
    )

    prompt_template = f"""
    You are an expert podcast scriptwriter. Create an engaging podcast script based on the provided structured summary. The podcast is a conversation between two AI hosts: Dr. Anya Sharma (The Expert) and Leo Grant (The Curious Analyst).

    **Host Personas:**
    - **Dr. Anya Sharma:** A seasoned researcher. Her tone is authoritative, clear, and insightful. She explains the technical details, methodology, and significance of the findings.
    - **Leo Grant:** A sharp, curious analyst. His tone is engaging and inquisitive. He asks clarifying questions, simplifies complex ideas, and connects the research to real-world implications.

    **Instructions:**
    1. The conversation must flow logically through the sections of the summary.
    2. Use punctuation to create a natural cadence. Use commas for short pauses and ellipses for longer pauses.
    3. Keep sentences short and conversational, ideally under 20 words.
    4. The final output MUST be a valid JSON array of objects. Each object must have a "speaker" key (either "Dr. Anya Sharma" or "Leo Grant") and a "line" key (the dialogue).

    Here is the structured summary:
    ---
    {summary}
    ---
    """
    
    try:
        print("--- Generating dialogue script... ---")
        response = model.generate_content(prompt_template)
        script_data = json.loads(response.text)
        print("--- Dialogue script generated and parsed successfully. ---")
        return script_data
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from LLM response. Response was:\n{response.text}")
        raise ValueError("Failed to parse dialogue script from LLM response.")
    except Exception as e:
        print(f"Error generating dialogue script with Gemini: {e}")
        raise

# --- Sarvam Translation Function ---
def translate_text_with_sarvam(text: str, target_language_code: str) -> str:
    """
    Translates text to the target language using the Sarvam AI Translation API.
    """
    sarvam_api_key = os.getenv("SARVAM_API_KEY") or os.getenv("SARVAM_KEY")
    if not sarvam_api_key:
        raise ValueError("Sarvam API Key not found in environment (.env)")

    url = "https://api.sarvam.ai/v1/translate"
    
    headers = {
        "Authorization": f"Bearer {sarvam_api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "source_text": text,
        "source_language": "en",
        "target_language": target_language_code.split('-')[0]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        translated_text = response.json().get("translated_text")
        if not translated_text:
            raise ValueError("Translated text not found in Sarvam API response.")
        return translated_text
    except requests.exceptions.RequestException as e:
        print(f"Error calling Sarvam Translation API: {e}")
        return text
    except Exception as e:
        print(f"Error processing Sarvam translation: {e}")
        return text

# --- Sarvam TTS Functions ---

def _load_podcast_tts_config(language: str) -> dict:
    cfg_path = os.path.join("app", "services", "podcast_models.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get(language, {})
    except Exception:
        return {}

def _get_sarvam_client() -> SarvamTTS:
    api_key = os.getenv("SARVAM_API_KEY") or os.getenv("SARVAM_KEY")
    if not api_key:
        raise ValueError("Sarvam API key not found in environment (.env)")
    return SarvamTTS(api_key)

def _call_sarvam_tts(text: str, target_language_code: str, speaker: str, sample_rate: int) -> bytes:
    tts = _get_sarvam_client()
    audio_bytes = tts.synthesize_text(
        text=text,
        target_language=target_language_code,
        voice=speaker,
        sample_rate=sample_rate,
    )
    if not audio_bytes:
        raise SarvamTTSError("No audio returned from Sarvam")
    return audio_bytes

def _synthesize_audio_from_script_sarvam(script_path: str, segments_dir: str, language: str):
    """Synthesize audio using Sarvam TTS for all languages. Writes MP3 segments."""
    with open(script_path, "r", encoding="utf-8") as f:
        script_data = json.load(f)

    cfg = _load_podcast_tts_config(language)
    speakers_cfg = cfg.get("speakers", {})
    female_voice = speakers_cfg.get("female", "vidya")
    male_voice = speakers_cfg.get("male", "hitesh")
    
    persona_voices = {
        "Dr. Anya Sharma": female_voice,
        "Leo Grant": male_voice
    }

    target_language_code = cfg.get("target_language_code", "en-IN")
    sample_rate = int(cfg.get("sample_rate", 22050))
    
    for i, turn in enumerate(script_data):
        speaker_name = turn['speaker']
        voice = persona_voices.get(speaker_name, male_voice)
        print(f"Processing turn {i+1}/{len(script_data)} [Sarvam]: Speaker - {speaker_name} using voice '{voice}'")
        
        for j, chunk in enumerate(chunk_text_by_word_count(turn["line"], 30)):
            print(f"  -> Synthesizing part {j+1}...")
            audio_bytes = _call_sarvam_tts(
                chunk,
                target_language_code,
                voice,
                sample_rate,
            )
            segment_filename = f"turn_{i:03d}_part_{j:03d}.mp3"
            segment_filepath = os.path.join(segments_dir, segment_filename)
            with open(segment_filepath, "wb") as audio_file:
                audio_file.write(audio_bytes)

# --- FFmpeg Assembly Functions ---

def _run_ffmpeg(command: list):
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print("!!! FFmpeg Error!!!")
        print(f"Stderr: {e.stderr}")
        raise

def _assemble_podcast_mp3(segments_dir: str, base_dir: str, output_path: str):
    """Concatenate MP3 segments using a robust filter method."""
    print("--- Assembling final podcast file (Sarvam MP3) ---")
    
    segment_files = sorted([
        f for f in os.listdir(segments_dir) 
        if f.endswith('.mp3')
    ])

    if not segment_files:
        raise ValueError("No audio segments found to assemble (MP3)")

    segment_paths = [os.path.join(segments_dir, f) for f in segment_files]
    command = ['ffmpeg']
    for path in segment_paths:
        command.extend(['-i', path])
    
    filter_complex_str = "".join([f"[{i}:a]" for i in range(len(segment_paths))])
    filter_complex_str += f"concat=n={len(segment_paths)}:v=0:a=1[out]"

    command.extend([
        '-filter_complex', filter_complex_str,
        '-map', '[out]',
        '-y',
        output_path
    ])
    
    try:
        print("--- Running robust ffmpeg concat command... ---")
        subprocess.run(command, check=True, capture_output=True, text=True)
        print(f"--- Podcast assembled successfully at {output_path} ---")
    except subprocess.CalledProcessError as e:
        print("!!! FFmpeg Error (MP3 Filter Concat) !!!")
        print(f"Command: {' '.join(command)}")
        print(f"Stderr: {e.stderr}")
        raise

# --- Main Orchestrator ---

def generate_podcast_flow(paper_id: str, task_id: str, language: str = "English"):
    """
    The main orchestrator function that runs the entire podcast generation process.
    """
    print(f"--- Starting podcast generation for paper_id: {paper_id} (Task: {task_id}) [lang={language}] ---")
    
    try:
        # 1. Get Paper Text
        print(f"--- Task {task_id}: Accessing paper text for paper_id '{paper_id}' ---")
        if paper_id not in papers_storage:
            raise FileNotFoundError(f"Paper with ID '{paper_id}' not found in in-memory storage.")
        
        paper_info = papers_storage[paper_id]
        print(f"--- Task {task_id}: Found paper_info in storage. ---")
        
        text_path_key = "text_file_path" if "text_file_path" in paper_info else "tex_file_path"
        
        if not text_path_key in paper_info:
            raise FileNotFoundError(f"No text or tex file path key found in paper_info for paper '{paper_id}'.")

        text_file_path = paper_info[text_path_key]
        print(f"--- Task {task_id}: Attempting to read text from file: {text_file_path} ---")
        
        if not os.path.exists(text_file_path):
             raise FileNotFoundError(f"The text file '{text_file_path}' does not exist on the server.")

        with open(text_file_path, 'r', encoding='utf-8') as f:
            paper_text = f.read()
        
        print(f"--- Task {task_id}: Successfully read paper text. Length: {len(paper_text)} characters. ---")

        # 2. Setup Directories
        paths = setup_podcast_directory(paper_id)
        
        # 3. Phase 1: Generate and Save Summary
        print("--- Phase 1: Generating Structured Summary ---")
        summary = generate_structured_summary(paper_text)
        with open(paths["summary_file"], "w", encoding="utf-8") as f:
            f.write(summary)
            
        # 4. Phase 2: Generate Dialogue Script (always in English first)
        print("--- Phase 2: Generating English Dialogue Script ---")
        script_data = generate_dialogue_script(summary)
        
        # 4a. Phase 2a: Translate script if a non-English language is selected
        if language.strip().lower() != "english":
            print(f"--- Translating script to {language}... ---")
            cfg = _load_podcast_tts_config(language)
            target_language_code = cfg.get("target_language_code", "hi-IN")
            translated_script = []
            total_turns = len(script_data)

            for i, turn in enumerate(script_data):
                try:
                    print(f"  -> Translating turn {i+1}/{total_turns}...")
                    translated_line = translate_text_with_sarvam(turn["line"], target_language_code)
                    translated_script.append({
                        "speaker": turn["speaker"],
                        "line": translated_line
                    })
                    time.sleep(1)
                except Exception as e:
                    print(f"  ✗ WARNING: Failed to translate turn {i+1}. Using original English text. Error: {e}")
                    translated_script.append(turn)
            script_data = translated_script
            print("--- Translation complete. ---")

        # Save the final (potentially translated) script
        with open(paths["script_file"], "w", encoding="utf-8") as f:
            json.dump(script_data, f, indent=4, ensure_ascii=False)
            
        # 5. Phase 3 & 4: Synthesize and Assemble using Sarvam for ALL languages
        print("--- Phase 3: Synthesizing Audio from Script using Sarvam ---")
        _synthesize_audio_from_script_sarvam(paths["script_file"], paths["segments"], language)
        _assemble_podcast_mp3(paths["segments"], paths["base"], paths["final_podcast"])
        
        print(f"--- Podcast generation complete for paper_id: {paper_id} ---")
        
    except Exception as e:
        print(f"!!! FATAL ERROR during podcast flow for task {task_id}: {e} !!!")
        raise e

