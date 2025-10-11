# In backend/app/services/podcast_service.py

import os
from app.routes.papers import papers_storage
import subprocess
import json
import time
import requests
import google.generativeai as genai
import asyncio
import aiohttp


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

# It's a good practice to load the API key from environment variables
# Ensure your backend/.env file has: GOOGLE_API_KEY="your_api_key_here"
# You can also pass the key directly to the functions if you prefer.
API_KEY = os.getenv("GOOGLE_API_KEY")

def generate_structured_summary(paper_text: str) -> str:
    """
    Phase 1: Uses the Gemini API to generate a structured, thematic summary
    of the research paper. This summary acts as a high-quality input for the
    next phase.
    """
    if not API_KEY:
        raise ValueError("Google API Key not found. Please set it in your.env file.")
        
    genai.configure(api_key=API_KEY)
    # This code is already compatible with google-generativeai v0.7.0
    model = genai.GenerativeModel('gemini-2.5-flash')

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
    structured summary into a JSON dialogue script between two AI hosts.
    Updated for google-generativeai v0.7.0+ with JSON mode.
    """
    if not API_KEY:
        raise ValueError("Google API Key not found. Please set it in your.env file.")

    genai.configure(api_key=API_KEY)
    
    # **UPDATED**: Use JSON mode for reliable JSON output, a key feature in recent library versions.
    # This ensures the model's response is a valid JSON string.
    model = genai.GenerativeModel(
        'gemini-2.5-flash',
        generation_config={"response_mime_type": "application/json"}
    )

    prompt_template = f"""
    You are an expert podcast scriptwriter. Create an engaging podcast script based on the provided structured summary. The podcast is a conversation between two AI hosts: Dr. Anya Sharma (The Expert) and Leo Grant (The Curious Analyst).

    **Host Personas:**
    - **Dr. Anya Sharma:** A seasoned researcher. Her tone is authoritative, clear, and insightful. She explains the technical details, methodology, and significance of the findings.
    - **Leo Grant:** A sharp, curious analyst. His tone is engaging and inquisitive. He asks clarifying questions, simplifies complex ideas, and connects the research to real-world implications.

    **Instructions:**
    1. The conversation must flow logically through the sections of the summary (Introduction, Methodology, Key Findings, Conclusion).
    2. **IMPORTANT FOR PACING:** Use punctuation to create a natural cadence. Use commas (`,`) for short pauses and ellipses (`...`) for longer, more thoughtful pauses.
    3. **IMPORTANT FOR CLARITY:** Keep sentences short and conversational, ideally under 20 words. This will make the delivery slower and easier to understand.
    4. The final output MUST be a valid JSON array of objects. Each object must have a "speaker" key (either "Dr. Anya Sharma" or "Leo Grant") and a "line" key (the dialogue).

    Here is the structured summary:
    ---
    {summary}
    ---
    """
    
    try:
        print("--- Generating dialogue script... ---")
        response = model.generate_content(prompt_template)
        
        # **UPDATED**: With JSON mode, the response.text is already a clean JSON string.
        # No manual cleaning of markdown backticks is needed.
        script_data = json.loads(response.text)
        print("--- Dialogue script generated and parsed successfully. ---")
        return script_data
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from LLM response. Response was:\n{response.text}")
        raise ValueError("Failed to parse dialogue script from LLM response.")
    except Exception as e:
        print(f"Error generating dialogue script with Gemini: {e}")
        raise

# Load AnuvaadHub credentials from environment variables
ANUVAAD_TTS_ENDPOINT = os.getenv("ANUVAAD_TTS_ENDPOINT_IITM_ENGLISH")
ANUVAAD_ACCESS_TOKEN = os.getenv("ANUVAAD_TTS_ACCESS_TOKEN_IITM_ENGLISH")

def call_anuvaad_tts(text: str, gender: str) -> bytes:
    """
    Calls the AnuvaadHub TTS API, which returns an S3 URL, and then
    downloads the audio file from that URL.
    """
    if not ANUVAAD_TTS_ENDPOINT or not ANUVAAD_ACCESS_TOKEN:
        raise ValueError("AnuvaadHub credentials not found in.env file.")

    headers = {
        "access-token": ANUVAAD_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }
    
    payload = {
        "text": text,
        "gender": gender
    }

    try:
        # In a production environment, you should ensure the server's SSL certificate is trusted.
        # For local testing, we disable verification to bypass SSL errors.
        response = requests.post(ANUVAAD_TTS_ENDPOINT, json=payload, headers=headers, verify=False)
        response.raise_for_status() # Raises an error for bad status codes
        
        response_data = response.json()
        if response_data.get("status")!= "success":
            raise Exception(f"AnuvaadHub API returned an error: {response_data.get('error')}")

        s3_url = response_data["data"]["s3_url"]
        
        # Step 2: GET request to download the audio file from the S3 URL
        audio_response = requests.get(s3_url)
        audio_response.raise_for_status()
        
        return audio_response.content # Return the raw audio bytes

    except requests.exceptions.RequestException as e:
        print(f"AnuvaadHub API request failed: {e}")
        raise

async def call_anuvaad_tts_async(session: aiohttp.ClientSession, text: str, gender: str) -> bytes:
    """
    Asynchronously calls the AnuvaadHub TTS API using aiohttp.
    """
    if not ANUVAAD_TTS_ENDPOINT or not ANUVAAD_ACCESS_TOKEN:
        raise ValueError("AnuvaadHub credentials not found in .env file.")

    headers = {
        "access-token": ANUVAAD_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }
    
    payload = {
        "text": text,
        "gender": gender
    }

    try:
        # The `ssl=False` parameter is used to bypass SSL verification for local testing.
        # In a production environment, you should ensure the server's certificate is trusted.
        async with session.post(ANUVAAD_TTS_ENDPOINT, json=payload, headers=headers, ssl=False) as response:
            response.raise_for_status()
            response_data = await response.json()

            if response_data.get("status") != "success":
                raise Exception(f"AnuvaadHub API returned an error: {response_data.get('error')}")

            s3_url = response_data["data"]["s3_url"]
            
            async with session.get(s3_url) as audio_response:
                audio_response.raise_for_status()
                return await audio_response.read()

    except aiohttp.ClientError as e:
        print(f"AnuvaadHub API request failed: {e}")
        raise

async def synthesize_audio_from_script_async(script_path: str, segments_dir: str, max_concurrent: int = 5):
    """
    Asynchronously generates audio for each chunk in a dialogue script using a
    concurrency limiter.
    """
    with open(script_path, "r") as f:
        script_data = json.load(f)

    persona_voices = {
        "Dr. Anya Sharma": "female",
        "Leo Grant": "male"
    }
    
    semaphore = asyncio.Semaphore(max_concurrent)
    tasks = []

    async def process_chunk(session, turn_idx, part_idx, chunk, speaker):
        async with semaphore:
            print(f"  -> Synthesizing turn {turn_idx+1}, part {part_idx+1}...")
            gender = persona_voices.get(speaker, "male")
            try:
                audio_bytes = await call_anuvaad_tts_async(session, chunk, gender)
                if audio_bytes:
                    segment_filename = f"turn_{turn_idx:03d}_part_{part_idx:03d}.wav"
                    segment_filepath = os.path.join(segments_dir, segment_filename)
                    with open(segment_filepath, "wb") as audio_file:
                        audio_file.write(audio_bytes)
                    print(f"      ✓ Saved {segment_filename}")
            except Exception as e:
                print(f"      ✗ Failed turn {turn_idx+1}, part {part_idx+1}. Error: {e}")

    async with aiohttp.ClientSession() as session:
        total_turns = len(script_data)
        for i, turn in enumerate(script_data):
            speaker = turn["speaker"]
            line = turn["line"]
            
            print(f"Preparing turn {i+1}/{total_turns}: Speaker - {speaker}")
            text_chunks = list(chunk_text_by_word_count(line, 30))

            for j, chunk in enumerate(text_chunks):
                task = process_chunk(session, i, j, chunk, speaker)
                tasks.append(task)
        
        print(f"\n--- Starting parallel synthesis of {len(tasks)} audio chunks (max {max_concurrent} concurrent)... ---")
        await asyncio.gather(*tasks)

def assemble_podcast(segments_dir: str, base_dir: str, output_path: str):
    """
    Uses FFmpeg to concatenate all audio segments in the correct order
    into a single audio file.
    """
    print("--- Assembling final podcast file... ---")
    
    segment_files = [f for f in os.listdir(segments_dir) if f.endswith('.wav')]

    # Custom sort key to order files by turn number, then part number
    def sort_key(filename):
        parts = filename.replace('.wav', '').split('_')
        turn_num = int(parts[1])
        part_num = int(parts[3])
        return (turn_num, part_num)

    segment_files.sort(key=sort_key)

    if not segment_files:
        raise ValueError("No audio segments found to assemble.")

    list_file_path = os.path.join(base_dir, "mylist.txt")
    with open(list_file_path, 'w') as f:
        for filename in segment_files:
            f.write(f"file 'segments/{filename}'\n")

    # FFmpeg command to concatenate files using the 'concat' demuxer
    command = [
        'ffmpeg', 
        '-f', 'concat', 
        '-safe', '0', 
        '-i', list_file_path, 
        '-ar', '44100',
        '-ac', '2',
        '-b:a', '192k',
        '-y',
        output_path
    ]
    
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        print(f"--- Podcast assembled successfully at {output_path} ---")
    except subprocess.CalledProcessError as e:
        print("!!! FFmpeg Error!!!")
        print(f"Stderr: {e.stderr}")
        raise
    finally:
        if os.path.exists(list_file_path):
            os.remove(list_file_path)

def generate_podcast_flow(paper_id: str, task_id: str):
    """
    The main orchestrator function that runs the entire podcast generation process.
    """
    print(f"--- Starting podcast generation for paper_id: {paper_id} (Task: {task_id}) ---")
    
    # 1. Get Paper Text
    if paper_id not in papers_storage:
        raise FileNotFoundError(f"Paper with ID '{paper_id}' not found in storage.")
    
    paper_info = papers_storage[paper_id]
    # Use 'text_file_path' for PDFs, and 'tex_file_path' as a fallback for LaTeX
    text_path_key = "text_file_path" if "text_file_path" in paper_info else "tex_file_path"
    
    if not text_path_key in paper_info:
        raise FileNotFoundError(f"No text or tex file path found for paper '{paper_id}'.")

    text_file_path = paper_info[text_path_key]
    with open(text_file_path, 'r', encoding='utf-8') as f:
        paper_text = f.read()

    # 2. Setup Directories
    paths = setup_podcast_directory(paper_id)
    
    # 3. Phase 1: Generate and Save Summary
    print("--- Phase 1: Generating Structured Summary ---")
    summary = generate_structured_summary(paper_text)
    with open(paths["summary_file"], "w", encoding="utf-8") as f:
        f.write(summary)
        
    # 4. Phase 2: Generate and Save Dialogue Script
    print("--- Phase 2: Generating Dialogue Script ---")
    script_data = generate_dialogue_script(summary)
    with open(paths["script_file"], "w", encoding="utf-8") as f:
        json.dump(script_data, f, indent=4)
        
    # 5. Phase 3: Synthesize Audio Segments
    print("--- Phase 3: Synthesizing Audio from Script ---")
    # We now run the asynchronous synthesis function
    asyncio.run(synthesize_audio_from_script_async(paths["script_file"], paths["segments"]))
    
    # 6. Phase 4: Assemble Final Podcast
    print("--- Phase 4: Assembling Final Podcast ---")
    assemble_podcast(paths["segments"], paths["base"], paths["final_podcast"])
    
    print(f"--- Podcast generation complete for paper_id: {paper_id} ---")