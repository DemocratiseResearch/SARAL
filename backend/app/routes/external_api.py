from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Header, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
import os
import shutil
import uuid
import logging
from typing import Optional
from pathlib import Path
from app.services.pdf_processor import process_pdf_file
from app.services.ppt_generator2 import create_powerpoint_from_paper
from app.routes.scripts import get_or_load_scripts, scripts_storage, save_scripts_to_file
from app.routes.papers import save_paper_info, papers_storage
from app.services.script_generator import (
    generate_full_script_with_gemini,
    split_script_into_sections,
    clean_script_for_tts_and_video,
    generate_title_introduction,
    generate_all_bullet_points_with_gemini,
    extract_text_from_file,
    clean_text
)
from app.services.podcast_service import generate_podcast_with_gemini, get_audio_clips, combine_audio_clips, save_dialogue_to_file
from app.utils.timing import track_performance

logger = logging.getLogger(__name__)

router = APIRouter()

@track_performance
async def verify_external_api_key(x_api_key: str = Header(...)):
    expected_key = os.getenv("EXTERNAL_APP_API_KEY")
    if not expected_key:
        # If API key is not set in env, we might want to fail open or closed. 
        # For security, let's fail closed and log an error.
        logger.error("EXTERNAL_APP_API_KEY environment variable is not set!")
        raise HTTPException(status_code=500, detail="Server configuration error")
    
    if x_api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key

@router.post("/generate-ppt")
async def generate_ppt_external(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_external_api_key)
):
    """
    External endpoint to generate a PowerPoint presentation from a PDF.
    Returns the generated PPTX file.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)

    try:
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        
        api_keys = {
            "gemini_key": os.getenv("RESXIV_GEMINI_API_KEY"),
        }
        
        if not api_keys["gemini_key"]:
             raise HTTPException(status_code=500, detail="Backend configuration error: GEMINI_API_KEY missing")

        result = await process_pdf_file(pdf_path, paper_id, "paper", api_keys["gemini_key"])
        #result = await process_pdf_file(pdf_path, paper_id)
        result["source_type"] = "pdf"
        save_paper_info(paper_id, result)
        
        
        paper_info = result
        

        file_path = paper_info["text_file_path"]
        input_text = extract_text_from_file(file_path)
        input_text = clean_text(input_text)
        
        title_intro = generate_title_introduction(
            paper_info["metadata"].get("title", "Research Paper"),
            paper_info["metadata"].get("authors", "Author"),
            paper_info["metadata"].get("date", "2024")
        )
        full_script = generate_full_script_with_gemini(api_keys["gemini_key"], input_text)
        sections_scripts = split_script_into_sections(full_script)
        
        cleaned_sections = {}
        for section_name, script_text in sections_scripts.items():
            cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)
            
        all_bullet_points = generate_all_bullet_points_with_gemini(
             api_keys["gemini_key"],
             cleaned_sections
        )
        
        sections_with_bullets = {}
        for section_name in cleaned_sections.keys():
            sections_with_bullets[section_name] = {
                "script": cleaned_sections[section_name],
                "bullet_points": all_bullet_points.get(section_name, ["Key information"]),
                "assigned_image": None 
            }
            
        script_data = {
            "sections": sections_with_bullets,
            "full_script": full_script,
            "status": "generated",
            "source_type": "pdf",
            "title_intro_script": title_intro.strip()
        }
        scripts_storage[paper_id] = script_data
        save_scripts_to_file(paper_id, script_data)
        
        current_file = Path(__file__).resolve()
        backend_root = current_file.parent.parent.parent
        assets_dir = backend_root / "app" / "assets"
        TEMPLATE_FILE = assets_dir / "template-saral.pptx" 
        
        output_slides_dir = Path(f"temp/slides/{paper_id}")
        output_slides_dir.mkdir(parents=True, exist_ok=True)
        OUTPUT_FILE = output_slides_dir / f"{paper_id}_presentation.pptx"
        
        success = create_powerpoint_from_paper(paper_info, script_data, TEMPLATE_FILE, OUTPUT_FILE)
        
        if not success or not OUTPUT_FILE.exists():
            raise HTTPException(status_code=500, detail="Failed to generate PowerPoint file")
            
        return FileResponse(
            OUTPUT_FILE,
            media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',
            filename=f"{file.filename.replace('.pdf', '')}_presentation.pptx"
        )
        
    except Exception as e:
        logger.error(f"Error in external PPT generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")


@router.post("/generate-podcast")
async def generate_podcast_external(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_external_api_key)
):
    """
    External endpoint to generate a podcast audio from a PDF.
    Returns the WAV audio file.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        api_keys = {
             "gemini_key": os.getenv("RESXIV_GEMINI_API_KEY"),
        }
        if not api_keys["gemini_key"]:
             raise HTTPException(status_code=500, detail="Backend configuration error: GEMINI_API_KEY missing")

        from app.services.podcast_service import extract_text_from_pdf, clean_text 
        
        paper_text = extract_text_from_pdf(pdf_path)
        if not paper_text or len(paper_text.strip()) < 100:
             raise HTTPException(status_code=400, detail="Insufficient text extracted from PDF")
             
        paper_text = await clean_text(paper_text)
        
        podcast_dialogue = await generate_podcast_with_gemini(api_keys["gemini_key"], paper_text)
        
        language = "English"
        audio_files = await get_audio_clips(podcast_dialogue, language)
        
        combined_audio_path = await combine_audio_clips(audio_files, paper_id)
        
        if not combined_audio_path or not os.path.exists(combined_audio_path):
            raise HTTPException(status_code=500, detail="Failed to generate audio file")
            
        return FileResponse(
            combined_audio_path,
            media_type="audio/wav",
            filename=f"podcast_{paper_id}.wav"
        )

    except Exception as e:
        logger.error(f"Error in external Podcast generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

from app.services.poster_service import poster_service

@router.post("/generate-poster")
async def generate_poster_external(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_external_api_key)
):
    """
    External endpoint to generate a scientific poster from a PDF.
    Returns the generated Poster PDF file.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    paper_id = str(uuid.uuid4())
    temp_dir = Path(f"temp/papers/{paper_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    pdf_path = temp_dir / file.filename

    try:
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        resxiv_key = os.getenv("RESXIV_GEMINI_API_KEY")
        if not resxiv_key:
             raise HTTPException(status_code=500, detail="Backend configuration error: RESXIV_GEMINI_API_KEY missing")

        result = await poster_service.generate_poster(
            paper_id=paper_id,
            pdf_path=str(pdf_path.resolve()),
            api_key=resxiv_key
        )
        
        if result.get("status") != "success" or not result.get("pdf_path"):
             raise HTTPException(status_code=500, detail="Failed to generate poster")
             
        final_pdf_path = Path(result["pdf_path"])
        
        if not final_pdf_path.exists():
             raise HTTPException(status_code=500, detail="Generated poster file not found")

        return FileResponse(
            final_pdf_path,
            media_type="application/pdf",
            filename=f"poster_{paper_id}.pdf"
        )

    except Exception as e:
        logger.error(f"Error in external Poster generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")
