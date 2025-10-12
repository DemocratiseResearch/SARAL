from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Depends, Form, Request
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from typing import Dict, List
import os
import zipfile
import tempfile
import shutil
import uuid
import logging
import traceback
from pathlib import Path
from app.models.request_models import PaperResponse, PaperMetadata, ScriptResponse
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from app.services.pdf_processor import process_pdf_file
from app.services.script_generator import extract_paper_metadata
from app.services.storage_manager import storage_manager
from app.auth.dependencies import get_current_user
from app.routes.api_keys import get_api_keys
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
from app.services.video_service import create_video_with_audio
from app.services.language_service import translate_to_language
from app.services.arxiv_scraper import ArxivScraper

import app.services.script_to_video as script_to_video

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Keep in-memory storage for backward compatibility, but use persistent storage as the primary source
papers_storage = storage_manager.get_all_papers()

# Enhanced storage for scripts with bullet points
scripts_storage = {}

# In-memory storage for slides
slides_storage = {}

# In-memory storage for media
media_storage = {}


# Helper function to save paper info to both memory and persistent storage
def save_paper_info(paper_id: str, info: dict):
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)

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

def copy_paper_images(image_files: list, output_dir: str):
    """Copy paper images to slides output directory."""
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    for image_file in image_files:
        if os.path.exists(image_file):
            dest_path = os.path.join(images_dir, os.path.basename(image_file))
            shutil.copy2(image_file, dest_path)
            print(f"Copied image: {os.path.basename(image_file)}")

def ensure_scripts_directory():
    """Ensure scripts directory exists"""
    scripts_dir = "temp/scripts"
    os.makedirs(scripts_dir, exist_ok=True)
    return scripts_dir


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




@router.post("/upload_pdf_to_video")
async def upload_pdf_file_to_video(file: UploadFile = File(...), 
    api_keys: dict = Depends(get_api_keys)):

        tts_source =  "sarvam"
        # tts_source =  "bhashini"
        print("tts_source", tts_source)

        """Upload and process a PDF file of a research paper."""
        
        paper_id = str(uuid.uuid4())
        temp_dir = f"temp/papers/{paper_id}"
        os.makedirs(temp_dir, exist_ok=True)

        try:
            # Save uploaded PDF file
            pdf_path = os.path.join(temp_dir, file.filename)
            with open(pdf_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Process the PDF file
            result = process_pdf_file(pdf_path, paper_id)
            
            # Store paper info - result now contains tex_file_path for compatibility
            result["source_type"] = "pdf"  # Add source type
            save_paper_info(paper_id, result)
            print("result after uplaoding paper", result)
            # Log the storage info for debugging
            logger.info(f"Paper {paper_id} processed and stored with keys: {list(result.keys())}")
            

            """Generate scripts with bullet points."""
            await script_to_video.generate_scripts(paper_id, api_keys) 

            
            """Generate slides from scripts with bullet points."""
            await script_to_video.generate_slides(paper_id, api_keys)


            """Generate audio from slides with sections"""
            if tts_source == "sarvam":
                await script_to_video.generate_audio(paper_id, api_keys)
            if tts_source == "bhashini":
                await script_to_video.generate_bhashini_audio(paper_id, api_keys, "English", "male")


            """Generate final video from slides and audio."""
            
            video_info = await script_to_video.generate_video(paper_id, api_keys)
            
            return video_info 
            
        except Exception as e:
            logger.error(f"Error processing PDF file: {str(e)}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")


#  tts_source: str = Form(...),
@router.post("/upload_latex_to_video")
async def upload_latex_to_video(file: UploadFile = File(...), 
    api_keys: dict = Depends(get_api_keys)):
        tts_source = "sarvam"
        print("tts_source", tts_source)
        # """Upload and process a Latex of a research paper."""
        
        paper_id = str(uuid.uuid4())
        temp_dir = f"temp/papers/{paper_id}"
        os.makedirs(temp_dir, exist_ok=True)

        try:

            # Save uploaded ZIP file
            zip_path = os.path.join(temp_dir, file.filename)
            with open(zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Extract ZIP file
            extract_dir = os.path.join(temp_dir, "source")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            # Find main .tex file
            tex_file_path = find_tex_file(extract_dir)
            
            # Extract metadata
            metadata = extract_paper_metadata(tex_file_path)
            
            # Find images
            image_refs = find_image_references(tex_file_path)
            image_files = find_image_files(extract_dir, image_refs)
            
            # Store paper info
            paper_info = {
                "metadata": metadata,
                "tex_file_path": tex_file_path,
                "source_dir": extract_dir,
                "image_files": image_files,
                "zip_file_path": zip_path,  # Store original ZIP path
                "status": "processed",
                "source_type": "latex"
            }
            save_paper_info(paper_id, paper_info)
            
            logger.info(f"Processed ZIP file for paper {paper_id}")

            # #get keys of users
            # user = db.query(User).filter(User.id == current_user["id"]).first()
            # if not user:
            #     raise HTTPException(status_code=404, detail="User not found")

            # api_keys = {
            #     "gemini_key": os.getenv("GOOGLE_API_KEY"),
            #     "sarvam_key": os.getenv("SARVAM_API_KEY"),
            #     "openai_key": os.getenv("OPENAI_API_KEY")
            # }
            



            """Generate scripts with bullet points."""
            await script_to_video.generate_scripts(paper_id, api_keys)

            
            """Generate slides from scripts with bullet points."""
            await script_to_video.generate_slides(paper_id, api_keys)


            """Generate audio from slides with sections"""
            await script_to_video.generate_audio(paper_id, api_keys)


            """Generate final video from slides and audio."""
            video_info = await script_to_video.generate_video(paper_id, api_keys)
            
                
            return video_info 
            
        except Exception as e:
            logger.error(f"Error processing PDF file: {str(e)}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")


@router.post("/upload_arxiv_to_video")
async def upload_arxiv_to_video(arxiv_url: str = Form(...),
    api_keys: dict = Depends(get_api_keys)):
    
        # """Upload and process a Arxiv of a research paper."""

        scraper = ArxivScraper()
        paper_id = str(uuid.uuid4())
        temp_dir = f"temp/papers/{paper_id}"
        os.makedirs(temp_dir, exist_ok=True)

        try:

            # Download and extract source
            extracted_dir = scraper.download_source(arxiv_url)
            
            # Get metadata from arXiv page
            arxiv_metadata = scraper.get_paper_metadata(arxiv_url)
            
            # Find main .tex file
            tex_file_path = find_tex_file(extracted_dir)
            
            # Extract metadata from LaTeX file and merge with arXiv metadata
            latex_metadata = extract_paper_metadata(tex_file_path)
            metadata = {**latex_metadata, **arxiv_metadata}
            metadata["arxiv_id"] = scraper.extract_arxiv_id(arxiv_url)
            
            # Find images
            image_refs = find_image_references(tex_file_path)
            image_files = find_image_files(extracted_dir, image_refs)
            
            # Store paper info
            paper_info = {
                "metadata": metadata,
                "tex_file_path": tex_file_path,
                "source_dir": extracted_dir,
                "image_files": image_files,
                "arxiv_url": arxiv_url,  # Store arXiv URL
                "status": "processed",
                "source_type": "arxiv"
            }
            save_paper_info(paper_id, paper_info)
            
            logger.info(f"Processed arXiv paper {paper_id}")

            # #get keys of users
            # user = db.query(User).filter(User.id == current_user["id"]).first()
            # if not user:
            #     raise HTTPException(status_code=404, detail="User not found")

            # api_keys = {
            #     "gemini_key": os.getenv("GOOGLE_API_KEY"),
            #     "sarvam_key": os.getenv("SARVAM_API_KEY"),
            #     "openai_key": os.getenv("OPENAI_API_KEY")
            # }
            

            """Generate scripts with bullet points."""
            await script_to_video.generate_scripts(paper_id, api_keys) 

            
            """Generate slides from scripts with bullet points."""
            await script_to_video.generate_slides(paper_id, api_keys)


            """Generate audio from slides with sections"""
            await script_to_video.generate_audio(paper_id, api_keys)

        
            """Generate final video from slides and audio."""
            video_info = await script_to_video.generate_video(paper_id, api_keys)
            
                
            return video_info 
            
        except Exception as e:
            logger.error(f"Error processing PDF file: {str(e)}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")


@router.get("/{paper_id}/stream-video")
async def stream_video(paper_id: str, request: Request):
    # print("script_to_video.media_storage", script_to_video.media_storage)
    # if paper_id not in script_to_video.media_storage:
    #     raise HTTPException(status_code=404, detail="Video not found")

    # # # Get the actual stored video path instead of constructing it
    # video_path = script_to_video.media_storage[paper_id].get("video_path")
    # if not video_path or not os.path.exists(video_path):
    #     raise HTTPException(status_code=404, detail="Video file not found")

    video_path = f"temp/videos/{paper_id}/final_video_english.mp4"
    print("video_path", video_path)
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("range")
    
    if range_header:
        # Parse range header
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        # Ensure end doesn't exceed file size
        end = min(end, file_size - 1)
        chunk_size = end - start + 1

        def iterfile():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining:
                    chunk = f.read(min(8192, remaining))  # Read in 8KB chunks
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
                "Cache-Control": "no-cache",
            },
        )
    else:
        # Return entire file
        return StreamingResponse(
            open(video_path, "rb"),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Cache-Control": "no-cache",
            },
        )


@router.get("/{paper_id}/download-video")
async def download_video(paper_id: str):
    """Download the generated video."""
    # print("script_to_video.media_storage", script_to_video.media_storage)
    # if paper_id not in script_to_video.media_storage or "video_path" not in script_to_video.media_storage[paper_id]:
    #     raise HTTPException(status_code=404, detail="Video not found")
    
    # video_path = script_to_video.media_storage[paper_id]["video_path"]


    
    video_path = f"temp/videos/{paper_id}/final_video_english.mp4"
    print("video_path", video_path)
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    return FileResponse(
        video_path,
        media_type='video/mp4',
        filename=f"presentation_{paper_id}.mp4"
    )


@router.get("/{paper_id}/download-slides")
async def download_slides(paper_id: str):
    """Download the generated slides."""
    pdf_path = f"temp/slides/{paper_id}/{paper_id}_presentation.pdf"
    print("pdf_path", pdf_path)
    # if not video_path or not os.path.exists(video_path):
    #     raise HTTPException(status_code=404, detail="Video file not found")
    
    # pdf_path = script_to_video.media_storage[paper_id]["video_path"]
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    return FileResponse(
        pdf_path,
        media_type='application/pdf',
        filename=f"slides_{paper_id}.pdf"
    )


@router.get("/{paper_id}/metadata", response_model=PaperMetadata)
async def get_metadata(paper_id: str):
    """Get paper metadata."""
    # Try to get from storage manager first
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info:
        # Fall back to in-memory storage
        if paper_id not in papers_storage:
            raise HTTPException(status_code=404, detail="Paper not found")
        paper_info = papers_storage[paper_id]
    
    metadata = paper_info["metadata"]
    return PaperMetadata(**metadata)















