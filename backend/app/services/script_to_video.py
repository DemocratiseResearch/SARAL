from fastapi import HTTPException
# from fastapi.responses import StreamingResponse
from typing import Dict, List
import os
# import zipfile
# import tempfile
import shutil
# import uuid
import logging
import traceback
from pathlib import Path
# from app.models.request_models import PaperResponse, PaperMetadata, ScriptResponse, ArxivRequest
# from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
# from app.services.pdf_processor import process_pdf_file
# from app.services.script_generator import extract_paper_metadata
from app.services.storage_manager import storage_manager
# from app.auth.dependencies import get_current_user
# from sqlalchemy.orm import Session
# from app.database import get_db, User
from app.services.script_generator import (
    generate_full_script_with_gemini,
    split_script_into_sections,
    clean_script_for_tts_and_video,
    generate_title_introduction,
    extract_text_from_file,
    clean_text,
    generate_all_bullet_points_with_gemini
)
from app.services.beamer_generator import create_beamer_presentation
from app.utils.latex_to_images import compile_latex, convert_pdf_to_images
import json
from app.services.hindi_service import generate_hindi_script_with_google
from app.services.tts_service import ensure_audio_is_generated, ensure_hindi_audio_is_generated, ensure_language_audio_is_generated
from app.services.tts_service import ensure_audio_is_generated_bhashini, bhashini_mt
from app.services.video_service import create_video_with_audio
from app.services.language_service import translate_to_language
import json
import aiohttp
import asyncio
from app.utils.timing import track_performance

# Configure logging
logger = logging.getLogger(__name__)


# Keep in-memory storage for backward compatibility, but use persistent storage as the primary source
papers_storage = storage_manager.get_all_papers()

# Enhanced storage for scripts with bullet points
scripts_storage = {}

# In-memory storage for slides
slides_storage = {}

# In-memory storage for media
media_storage = {}



request = {
            "voice_selection": {
                "English": "simran",
            },
            "hinglish_iterations": 3,
            "show_hindi_debug": False,
            "selected_language": "English"
        }

@track_performance
def save_paper_info(paper_id: str, info: dict):
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)

@track_performance
def copy_beamer_theme_files(output_dir: str):
    """Copy Beamer theme files to output directory."""
    theme_files = [
        'beamerthemeSimpleDarkBlue.sty',
        'beamerfontthemeSimpleDarkBlue.sty',
        'beamercolorthemeSimpleDarkBlue.sty',
        'beamerinnerthemeSimpleDarkBlue.sty'
    ]
    
    # Look for theme files in various locations
    theme_paths = [
        'temp/latex_template',
        'latex_template',
        '../latex_template'
    ]
    
    for theme_path in theme_paths:
        if os.path.exists(theme_path):
            for theme_file in theme_files:
                source_file = os.path.join(theme_path, theme_file)
                if os.path.exists(source_file):
                    dest_file = os.path.join(output_dir, theme_file)
                    shutil.copy2(source_file, dest_file)
                    print(f"Copied theme file: {theme_file}")
            break

@track_performance
def copy_paper_images(image_files: list, output_dir: str):
    """Copy paper images to slides output directory."""
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    for image_file in image_files:
        if os.path.exists(image_file):
            dest_path = os.path.join(images_dir, os.path.basename(image_file))
            shutil.copy2(image_file, dest_path)
            print(f"Copied image: {os.path.basename(image_file)}")

@track_performance
def ensure_scripts_directory():
    """Ensure scripts directory exists"""
    scripts_dir = "temp/scripts"
    os.makedirs(scripts_dir, exist_ok=True)
    return scripts_dir


@track_performance
def load_scripts_from_file(paper_id: str) -> Dict:
    """Load scripts from file with proper error handling"""
    scripts_dir = ensure_scripts_directory()
    scripts_file = os.path.join(scripts_dir, f"{paper_id}_scripts.json")
    
    if os.path.exists(scripts_file):
        try:
            with open(scripts_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.info(f"Loaded scripts from file for paper {paper_id}")
                return data
        except Exception as e:
            logger.error(f"Error loading scripts file {scripts_file}: {str(e)}")
            return {}
    
    logger.info(f"No scripts file found for paper {paper_id}")
    return {}

@track_performance
def save_scripts_to_file(paper_id: str, data: Dict) -> bool:
    """Save scripts to file with proper error handling"""
    try:
        scripts_dir = ensure_scripts_directory()
        print("scripts_dir", scripts_dir)
        scripts_file = os.path.join(scripts_dir, f"{paper_id}_scripts.json")
        print("scripts_file", scripts_file)
        with open(scripts_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Successfully saved scripts to {scripts_file}")
        return True
    except Exception as e:
        logger.error(f"Error saving scripts file: {str(e)}")
        return False


@track_performance
async def download_audio_file(url: str, save_path: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                with open(save_path, "wb") as f:
                    f.write(await resp.read())
                return save_path
            else:
                raise Exception(f"Failed to download audio. Status: {resp.status}")

@track_performance
async def generate_scripts(paper_id, api_keys):
    # Try to get paper from storage manager first
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info:
        # Fall back to in-memory storage
        if paper_id not in papers_storage:
            logger.error(f"Paper ID {paper_id} not found in storage. Available IDs: {list(papers_storage.keys())}")
            raise HTTPException(status_code=404, detail=f"Paper ID {paper_id} not found")
        paper_info = papers_storage[paper_id]
    
    if not api_keys.get("gemini_key"):
        raise HTTPException(status_code=400, detail="Gemini API key required")


    try:
        # Check if this is a PDF-sourced file or LaTeX file
        source_type = paper_info.get("source_type", "pdf")
        logger.info(f"Processing paper {paper_id} of source type {source_type}")
        
        # Get the path to the file (could be tex_file_path for LaTeX or text_file_path for PDF)
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
            logger.info(f"Using tex_file_path: {file_path}")
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
            logger.info(f"Using text_file_path: {file_path}")
        else:
            available_keys = list(paper_info.keys())
            logger.error(f"No text or tex file path found. Available keys: {available_keys}")
            raise ValueError(f"No text or tex file path found in paper info. Available keys: {available_keys}")
        
        # Use the same metadata that's stored in paper_info for consistency
        # This ensures that the title intro script uses the same metadata as the slides
        metadata = paper_info["metadata"]
        title_intro = generate_title_introduction(
            metadata.get("title", "Research Paper"),
            metadata.get("authors", "Author"),
            metadata.get("date", "2024")
        )
        print(f"Generated title introduction: {title_intro}")
        print("metadata", metadata)
        input_text = extract_text_from_file(file_path)
        input_text = clean_text(input_text)
        
        # Generate full script using Gemini with improved prompts
        full_script = generate_full_script_with_gemini(api_keys["gemini_key"], input_text)
        print("fullscript of paper", full_script)
        # Split into sections
        sections_scripts = split_script_into_sections(full_script)
        
        # Clean each section for TTS
        cleaned_sections = {}
        for section_name, script_text in sections_scripts.items():
            cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)
        
        # Generate bullet points for all sections with a single prompt
        logger.info(f"Generating bullet points for all sections using single prompt")
        all_bullet_points = generate_all_bullet_points_with_gemini(
            api_keys["gemini_key"],
            cleaned_sections
        )
        logger.info(f"Generated bullet points for {len(all_bullet_points)} sections")
        
        # Combine cleaned scripts with bullet points
        sections_with_bullets = {}
        for section_name in cleaned_sections.keys():
            sections_with_bullets[section_name] = {
                "script": cleaned_sections[section_name],
                "bullet_points": all_bullet_points.get(section_name, ["Key information from this section"]),
                "assigned_image": None
            }
        
        # Store comprehensive script data
        script_data = {
            "sections": sections_with_bullets,
            "full_script": full_script,
            "status": "generated",
            "source_type": source_type,
            "title_intro_script": title_intro.strip()
        }
        
        scripts_storage[paper_id] = script_data
        
        # Save to file immediately
        if not save_scripts_to_file(paper_id, script_data):
            logger.warning(f"Failed to save scripts to file for paper {paper_id}")
        
        # Return only script text for compatibility
        sections_scripts_only = {k: v["script"] for k, v in sections_with_bullets.items()}
        
        
    except Exception as e:
        logger.error(f"Error generating script: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating script: {str(e)}")


@track_performance
async def generate_slides(paper_id:str, api_keys):
    if paper_id not in scripts_storage:
        # Try to load scripts from file
        scripts_file = f"temp/scripts/{paper_id}_scripts.json"
        if os.path.exists(scripts_file):
            import jsonSession
            with open(scripts_file, 'r', encoding='utf-8') as f:
                scripts_storage[paper_id] = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="Scripts not generated yet")
    
    try:
        paper_info = papers_storage[paper_id]
        scripts_info = scripts_storage[paper_id]
        
        # Create output directory
        output_dir = f"temp/slides/{paper_id}"
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Copy theme files to output directory
        copy_beamer_theme_files(output_dir)
        
        # Copy images to output directory
        copy_paper_images(paper_info.get("image_files", []), output_dir)
        
        # Get image assignments
        image_assignments = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if section_data.get("assigned_image"):
                image_assignments[section_name] = section_data["assigned_image"]
        
        print("image_assignments", image_assignments)
        # Create Beamer presentation with bullet points
        latex_file = create_beamer_presentation(
            paper_id,
            scripts_info,
            paper_info["metadata"],
            image_assignments
        )
        
        print("after creating beamer")
        # Copy LaTeX file to output directory
        output_latex = os.path.join(output_dir, f"{paper_id}_presentation.tex")
        print("output_latex", output_latex)
        print("output_dir", output_dir)
        shutil.copy2(latex_file, output_latex)
        
        # Compile LaTeX to PDF
        pdf_path = compile_latex(output_latex, output_dir)
        print("after compiling latex to beamer")
        if not pdf_path:
            raise Exception("Failed to compile LaTeX to PDF")
        
        # Convert PDF to images
        image_paths = convert_pdf_to_images(pdf_path, output_dir, dpi=300)
        
        if not image_paths:
            raise Exception("Failed to convert PDF to images")
        
        # Store slide info
        slides_storage[paper_id] = {
            "pdf_path": pdf_path,
            "image_paths": image_paths,
            "latex_path": output_latex,
            "output_dir": output_dir,
            "status": "generated"
        }
        
        
    except Exception as e:
        print(f"Error generating slides: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating slides: {str(e)}")


@track_performance
async def generate_audio(paper_id:str, api_keys):
    if paper_id not in scripts_storage:
        scripts_file = f"temp/scripts/{paper_id}_scripts.json"
        if os.path.exists(scripts_file):
            import json
            with open(scripts_file, 'r', encoding='utf-8') as f:
                scripts_storage[paper_id] = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="Scripts not found")

    if not api_keys.get("sarvam_key"):
        raise HTTPException(status_code=400, detail="Sarvam API key required for TTS")

    try:
        scripts_info = scripts_storage[paper_id]
        audio_dir = f"temp/audio/{paper_id}"
        Path(audio_dir).mkdir(parents=True, exist_ok=True)

        sections_scripts = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if isinstance(section_data, dict):
                sections_scripts[section_name] = section_data.get("script", "")
            else:
                sections_scripts[section_name] = str(section_data)

        if request["selected_language"] == "Hindi":
            print("Generating Hindi audio")
            print(f"Title intro script: {scripts_info.get('title_intro_script', '')}")
            title_intro_hindi = generate_hindi_script_with_google(
                scripts_info.get("title_intro_script", ""),
                api_keys.get("sarvam_key")
            )
            hindi_sections_scripts = {
                name: generate_hindi_script_with_google(script, api_keys.get("sarvam_key"))
                for name, script in sections_scripts.items()
            }
            title_intro_script = title_intro_hindi
            sections_scripts = hindi_sections_scripts
            language = "Hindi"
        elif request["selected_language"] == "English":
            title_intro_script = scripts_info.get("title_intro_script", "")
            language = "English"
        else:
            print(f"Translating to", request["selected_language"])
            title_intro_script = translate_to_language(
                scripts_info.get("title_intro_script", ""),
                request["selected_language"],
                api_keys.get("sarvam_key")
            )
            sections_scripts = {
                name: translate_to_language(script, request["selected_language"], api_keys.get("sarvam_key"))
                for name, script in sections_scripts.items()
            }
            language = request["selected_language"]
        print(f"Title intro script: {title_intro_script}")
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]

        if language == "Hindi":
            audio_response = ensure_hindi_audio_is_generated(
                sarvam_api_key=api_keys.get("sarvam_key"),
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=request["voice_selection"],
                hinglish_iterations=request["hinglish_iterations"],
                openai_api_key=api_keys.get("openai_key"),
                show_hindi_debug=request["show_hindi_debug"],
                section_order=section_order
            )
        elif language == "English":
            audio_response = ensure_audio_is_generated(
                sarvam_api_key=api_keys.get("sarvam_key"),
                language=language,
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=request["voice_selection"],
                hinglish_iterations=request["hinglish_iterations"],
                openai_api_key=api_keys.get("openai_key"),
                show_hindi_debug=request["show_hindi_debug"],
                section_order=section_order,
            )
        else:
            audio_response = ensure_language_audio_is_generated(
                sarvam_api_key=api_keys.get("sarvam_key"),
                language=language,
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=request["voice_selection"],
                hinglish_iterations=request["hinglish_iterations"],
                openai_api_key=api_keys.get("openai_key"),
                section_order=section_order
            )

        audio_files = audio_response["audio_files"]
        if paper_id not in media_storage:
            media_storage[paper_id] = {}

        media_storage[paper_id]["audio_files"] = [os.path.join(audio_dir, f) for f in audio_files]
        media_storage[paper_id]["audio_dir"] = audio_dir

    except Exception as e:
        print(f"Error generating audio: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")



@track_performance
async def generate_video(paper_id: str, api_keys):
    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not found")
    
    if paper_id not in media_storage or "audio_files" not in media_storage[paper_id]:
        raise HTTPException(status_code=404, detail="Audio files not found")
    
    try:
        slides_info = slides_storage[paper_id]
        media_info = media_storage[paper_id]
        
        # Create video directory
        video_dir = f"temp/videos/{paper_id}"
        Path(video_dir).mkdir(parents=True, exist_ok=True)
        
        # Get slide images and audio files
        slide_images = slides_info["image_paths"]
        audio_files = media_info["audio_files"]
        
        print(f"Creating video with {len(slide_images)} slides and {len(audio_files)} audio files")
        audio_selected_language = request["selected_language"]
        # Generate video
        output_file = os.path.join(video_dir, f"final_video_{audio_selected_language.lower()}.mp4")
        background_music_file = f"temp/papers/{paper_id}"
        video_path = create_video_with_audio(
            slide_images=slide_images,
            audio_files=audio_files,
            # background_music_file=request.background_music_file,
            output_file=output_file
        )
        
        media_storage[paper_id]["video_path"] = video_path
        
        return {
            "audio_files": [os.path.basename(f) for f in audio_files],
            "video_path": os.path.basename(video_path) if video_path else None,
            "paper_id": paper_id
        }
    except Exception as e:
        print(f"Error generating video: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating video: {str(e)}")



@track_performance
async def generate_bhashini_audio(paper_id: str, api_keys, lang, gender):
    print("inside generate bhashini audio")
    if paper_id not in scripts_storage:
        scripts_file = f"temp/scripts/{paper_id}_scripts.json"
        if os.path.exists(scripts_file):
            with open(scripts_file, 'r', encoding='utf-8') as f:
                scripts_storage[paper_id] = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="Scripts not found")

    try:
        scripts_info = scripts_storage[paper_id]
        audio_dir = f"temp/audio/{paper_id}"
        Path(audio_dir).mkdir(parents=True, exist_ok=True)

        # Extract scripts
        sections_scripts = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if isinstance(section_data, dict):
                sections_scripts[section_name] = section_data.get("script", "")
            else:
                sections_scripts[section_name] = str(section_data)

        # Load models.json
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        MODEL_PATH = os.path.join(BASE_DIR, "models.json")
        with open(MODEL_PATH, "r") as f:
            data = json.load(f)

        title_intro_script = scripts_info.get("title_intro_script", "")
        language = lang

        # ---------------------------
        # Translation if not English
        # ---------------------------
        if lang != "English":
            mt_api_url, mt_access_token = None, None
            for item in data:
                if (
                    item.get("model_type") == "mt"
                    and item.get("source_language") == "English"
                    and item.get("target_language") == lang
                ):
                    mt_api_url = item.get("api_url")
                    mt_access_token = item.get("access_token")

            if not mt_api_url or not mt_access_token:
                raise HTTPException(status_code=400, detail=f"No MT model found for {lang}")

            headers = {"access-token": mt_access_token}

            async with aiohttp.ClientSession() as session:
                # Translate title + sections concurrently
                title_task = bhashini_mt(title_intro_script, headers, mt_api_url, session)
                section_tasks = [bhashini_mt(script, headers, mt_api_url, session) for script in sections_scripts.values()]

                results = await asyncio.gather(title_task, *section_tasks)

                title_intro_script = results[0]
                translated_sections = {name: text for name, text in zip(sections_scripts.keys(), results[1:])}
                sections_scripts = translated_sections

        # ---------------------------
        # TTS Generation
        # ---------------------------
        tts_api_url, tts_access_token = None, None
        for item in data:
            if item.get("model_type") == "tts" and item.get("source_language") == lang:
                tts_api_url = item.get("api_url")
                tts_access_token = item.get("access_token")

        if not tts_api_url or not tts_access_token:
            raise HTTPException(status_code=400, detail=f"No TTS model found for {lang}")

        headers = {"access-token": tts_access_token}
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
        audio_response = await ensure_audio_is_generated_bhashini(
            language=language,
            gender=gender,
            headers=headers,
            api_url=tts_api_url,
            paper_id=paper_id,
            title_intro_script=title_intro_script,
            sections_scripts=sections_scripts,
            section_order= section_order
        )

        # Save in storage
        audio_files = audio_response["audio_files"]
        if paper_id not in media_storage:
            media_storage[paper_id] = {}

        media_storage[paper_id]["audio_files"] = [os.path.join(audio_dir, os.path.basename(f)) for f in audio_files]
        media_storage[paper_id]["audio_dir"] = audio_dir

        return audio_response

    except Exception as e:
        print(f"Error generating audio: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")




@track_performance
async def mt_bhashini_title(title_intro_script, lang):
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")
    with open(MODEL_PATH, "r") as f:
        data = json.load(f)


    mt_api_url, mt_access_token = None, None
    for item in data:
        if (
            item.get("model_type") == "mt"
            and item.get("source_language") == "English"
            and item.get("target_language") == lang
        ):
            mt_api_url = item.get("api_url")
            mt_access_token = item.get("access_token")

    if not mt_api_url or not mt_access_token:
        raise HTTPException(status_code=400, detail=f"No MT model found for {lang}")

    headers = {"access-token": mt_access_token}

    async with aiohttp.ClientSession() as session:
        # Translate title + sections concurrently
        title_task = await bhashini_mt(title_intro_script, headers, mt_api_url)
        title_intro_script = title_task
        print("title_intro_script", title_intro_script)
        # section_tasks = [bhashini_mt(script, headers, mt_api_url, session) for script in sections_scripts.values()]

        # results = await asyncio.gather(title_task, *section_tasks)

        # title_intro_script = results[0]
        # translated_sections = {name: text for name, text in zip(sections_scripts.keys(), results[1:])}
        # sections_scripts = translated_sections
        return title_intro_script



@track_performance   
async def mt_bhashini_sections(sections_scripts, lang):
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")
    with open(MODEL_PATH, "r") as f:
        data = json.load(f)


    mt_api_url, mt_access_token = None, None
    for item in data:
        if (
            item.get("model_type") == "mt"
            and item.get("source_language") == "English"
            and item.get("target_language") == lang
        ):
            mt_api_url = item.get("api_url")
            mt_access_token = item.get("access_token")

    if not mt_api_url or not mt_access_token:
        raise HTTPException(status_code=400, detail=f"No MT model found for {lang}")

    headers = {"access-token": mt_access_token}

    async with aiohttp.ClientSession() as session:
        # Translate title + sections concurrently
        # title_task = bhashini_mt(title_intro_script, headers, mt_api_url, session)
        # title_intro_script = title_task
        # print("title_intro_script", title_intro_script)
        section_tasks = [bhashini_mt(script, headers, mt_api_url) for script in sections_scripts.values()]

        results = await asyncio.gather(*section_tasks)

        # title_intro_script = results[0]
        translated_sections = {name: text for name, text in zip(sections_scripts.keys(), results[0:])}
        sections_scripts = translated_sections
        return sections_scripts
    
    

@track_performance
async def tts_bhashini_title(title_intro_script, sections_scripts, lang, gender, paper_id, section_order):
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models.json")
    with open(MODEL_PATH, "r") as f:
        data = json.load(f)

    # scripts_info = paper_id
    audio_dir = f"temp/audio/{paper_id}"
    Path(audio_dir).mkdir(parents=True, exist_ok=True)

    tts_api_url, tts_access_token = None, None
    for item in data:
        if item.get("model_type") == "tts" and item.get("source_language") == lang:
            tts_api_url = item.get("api_url")
            tts_access_token = item.get("access_token")

    if not tts_api_url or not tts_access_token:
        raise HTTPException(status_code=400, detail=f"No TTS model found for {lang}")

    headers = {"access-token": tts_access_token}
    print("title_intro_script before TTS", title_intro_script)
    audio_response = await ensure_audio_is_generated_bhashini(
        language=lang,
        gender=gender,
        headers=headers,
        api_url=tts_api_url,
        paper_id=paper_id,
        title_intro_script=title_intro_script,
        sections_scripts=sections_scripts, 
        section_order= section_order
    )

    # Save in storage
    audio_files = audio_response["audio_files"]
    if paper_id not in media_storage:
        media_storage[paper_id] = {}

    media_storage[paper_id]["audio_files"] = [os.path.join(audio_dir, os.path.basename(f)) for f in audio_files]
    media_storage[paper_id]["audio_dir"] = audio_dir

    return audio_response


