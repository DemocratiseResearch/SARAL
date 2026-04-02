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
from datetime import datetime
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
from app.workers import get_worker_pool


from app.services.beamer_generator import create_beamer_presentation
from app.utils.latex_to_images import compile_latex, convert_pdf_to_images
import json
from app.services.hindi_service import generate_hindi_script_with_google
from app.services.tts_service import ensure_audio_is_generated, ensure_hindi_audio_is_generated, ensure_language_audio_is_generated
from app.services.video_service import create_video_with_audio
from app.services.language_service import translate_to_language
from app.services.arxiv_scraper import ArxivScraper
import app.services.script_to_video as script_to_video
import io
import aiohttp
from fastapi.datastructures import Headers
import asyncio
from playwright.async_api import async_playwright
import time
from app.utils.timing import track_performance
from app.services.metadata_tracker import track_paper_upload, track_output_generation
from app.middleware.session_tracking import get_user_context
from app.services.firestore_helpers import init_pipeline_tracking, update_pipeline_step, mark_pipeline_failed

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
async def download_biorxiv_paper(url, paper_id) -> UploadFile:
    if not url.startswith("http"):
        url = "https://" + url.strip()

    async with async_playwright() as playwright:
        args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-extensions",
            "--disable-software-rasterizer",
        ]
        
        browser = await playwright.chromium.launch(headless=True, args=args)
        
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.biorxiv.org/",
                "Upgrade-Insecure-Requests": "1"
            },
            viewport={'width': 1920, 'height': 1080}
        )

        page = await context.new_page()

        try:
            await page.goto(url, wait_until="load", timeout=120000)

            pdf_link = None
            selectors = [
                'a[href$=".full.pdf"]',
                'a[href$=".pdf"]',
                'a[href*="/content/"]'
            ]
            for selector in selectors:
                try:
                    await page.wait_for_selector(selector, timeout=15000)
                    pdf_link = await page.get_attribute(selector, 'href')
                    if pdf_link:
                        break
                except:
                    continue

            if not pdf_link:
                match = re.search(r"(10\.\d{4,9}/[^\s/]+)", url)
                if match:
                    doi = match.group(1)
                    pdf_link = f"https://www.biorxiv.org/content/{doi}.full.pdf"
                    print("Fallback PDF URL:", pdf_link)
                else:
                    raise Exception("PDF link not found on page")

            if pdf_link.startswith("/"):
                pdf_link = f"https://www.biorxiv.org{pdf_link}"

            print("Final PDF URL:", pdf_link)

            #  Download within Playwright browser to bypass 403
            async with page.expect_download() as download_info:
                await page.evaluate(f'window.open("{pdf_link}", "_blank");')

            download = await download_info.value

            # Save the downloaded file
            path = f"temp/downloads/paper_{paper_id}_source.pdf"
            os.makedirs(os.path.dirname(path), exist_ok=True)
            await download.save_as(path)

            # Read the file into UploadFile
            async with aiofiles.open(path, "rb") as file_obj:
                pdf_bytes = await file_obj.read()

            content = io.BytesIO(pdf_bytes)
            headers = Headers({"content-type": "application/pdf"})
            upload_file = UploadFile(
                file=content,
                filename=f"paper_{paper_id}.pdf",
                headers=headers
            )

            print(f" Downloaded BioRxiv PDF to {path}")
            return upload_file

        except Exception as e:
            print(f" Error downloading paper: {e}")
            raise HTTPException(status_code=500, detail=f"Error downloading paper: {e}")

        finally:
            await browser.close()



@router.post("/upload_pdf_to_video")
async def upload_pdf_file_to_video(file: UploadFile = File(...),  tts_source: str = Form(...),
    api_keys: dict = Depends(get_api_keys)):

        tts_source = tts_source.lower().strip()  # normalize value
        if tts_source not in ["sarvam", "bhashini"]:
            raise HTTPException(status_code=400, detail="Invalid tts_source. Must be 'sarvam' or 'bhashini'.")

        tts_source =  "sarvam"
        tts_source =  "sarvam"
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
            
            gemini_api_key = api_keys.get("gemini_key")
            if not gemini_api_key:
                raise HTTPException(status_code=400, detail="Gemini API key not configured")

            # Enqueue job to worker
            logger.info(f"[{paper_id[:8]}] Enqueuing PDF to video job")
            pool = await get_worker_pool()
            job = await pool.enqueue_job(
                'process_pdf_to_video_full_task',
                pdf_path,
                paper_id,
                tts_source,
                api_keys,
                _queue_name='pdf_to_video_queue'
            )
            
            # Wait for job to complete (blocking)
            logger.info(f"[{paper_id[:8]}] Waiting for job to complete...")
            result = await job.result(timeout=1800, poll_delay=2.0)  # 30 minutes timeout
            
            if result and result.get('status') == 'success':
                logger.info(f"[{paper_id[:8]}] Job completed successfully")
                return result.get('video_info')
            else:
                raise HTTPException(status_code=500, detail="Job failed or returned no result")
            
        except Exception as e:
            logger.error(f"Error processing PDF file: {str(e)}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")


@track_performance
async def save_uploaded_latex_zip(file: UploadFile, zip_path: str):
    """Track LaTeX ZIP file upload/save time."""
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)


@track_performance
async def enqueue_latex_to_video_job(pool, zip_path: str, paper_id: str, tts_source: str, api_keys: dict):
    """Track job enqueueing."""
    logger.info(f"[{paper_id[:8]}] Enqueuing LaTeX to video job")
    return await pool.enqueue_job(
        'process_latex_to_video_full_task',
        zip_path,
        paper_id,
        tts_source,
        api_keys,
        _queue_name='latex_to_video_queue'
    )


@track_performance
async def wait_for_latex_pipeline_result(job, paper_id: str):
    """Track time waiting for the entire LaTeX pipeline to complete."""
    logger.info(f"[{paper_id[:8]}] Waiting for full LaTeX pipeline to complete...")
    result = await job.result(timeout=1800, poll_delay=2.0)  # 30 minutes timeout
    return result


@router.post("/upload_latex_to_video")
async def upload_latex_to_video(
    request: Request,
    file: UploadFile = File(...),
    tts_source: str = Form(...),
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user)
):
    """Upload LaTeX ZIP and generate video with optional TTS source."""
    
    # Validate TTS source
    tts_source = tts_source.lower().strip()
    if tts_source not in ["sarvam", "bhashini"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid tts_source. Must be 'sarvam' or 'bhashini'."
        )
    
    # Override for testing (remove in production)
    tts_source = "sarvam"
    logger.info(f"Using TTS source: {tts_source}")
    
    # Validate file is a ZIP
    if not file.filename.endswith('.zip'):
        raise HTTPException(
            status_code=400,
            detail="Only ZIP files containing LaTeX source are allowed"
        )
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    # Get API keys from environment
    api_keys = {
        "gemini_key": os.getenv("GEMINI_API_KEY"),
        "sarvam_key": os.getenv("SARVAM_API_KEY"),
        "openai_key": os.getenv("OPENAI_API_KEY")
    }

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        user_ctx_early = get_user_context(request, current_user)
        init_pipeline_tracking(paper_id, user_id=user_ctx_early.get('user_id'))

        # Save uploaded ZIP file (tracked)
        zip_path = os.path.join(temp_dir, file.filename)
        await save_uploaded_latex_zip(file, zip_path)
        
        # Validate Gemini API key
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        # Get worker pool
        pool = await get_worker_pool()
        
        # Enqueue job to worker (tracked)
        job = await enqueue_latex_to_video_job(pool, zip_path, paper_id, tts_source, api_keys)
        
        # Wait for job to complete (tracked)
        result = await wait_for_latex_pipeline_result(job, paper_id)
        
        # Process result
        if result and result.get('status') == 'success':
            logger.info(f"[{paper_id[:8]}] LaTeX pipeline completed successfully")
            
            # Track paper upload and output generation
            user_ctx = get_user_context(request, current_user)
            track_paper_upload(
                paper_id=paper_id,
                user_id=user_ctx.get('user_id'),
                user_email=user_ctx.get('user_email'),
                session_id=user_ctx.get('session_id'),
                source_type='latex',
                filename=file.filename
            )
            
            track_output_generation(
                paper_id=paper_id,
                output_type='video',
                user_id=user_ctx.get('user_id')
            )
            

            video_info = result.get('video_info')
            return video_info
        else:
            error_detail = result.get('error', 'LaTeX pipeline failed or returned no result') if isinstance(result, dict) else 'LaTeX pipeline failed or returned no result'
            try:
                mark_pipeline_failed(paper_id, "video_generation", Exception(error_detail), started_at=_step_started_at)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise HTTPException(
                status_code=500,
                detail=error_detail
            )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] Error processing LaTeX file: {str(e)}")
        mark_pipeline_failed(paper_id, "video_generation", e, started_at=_step_started_at)
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing LaTeX file: {str(e)}"
        )


#the following arxiv to video codes is ONLY used when request is from the Saral website and not from the plugin

@track_performance
async def enqueue_arxiv_to_video_job(pool, arxiv_url: str, paper_id: str, tts_source: str, api_keys: dict):
    """Track job enqueueing."""
    logger.info(f"[{paper_id[:8]}] Enqueuing arXiv to video job")
    return await pool.enqueue_job(
        'process_arxiv_to_video_full_task',
        arxiv_url,
        paper_id,
        tts_source,
        api_keys,
        _queue_name='arxiv_to_video_queue'
    )


@track_performance
async def wait_for_arxiv_pipeline_result(job, paper_id: str):
    """Track time waiting for the entire arXiv pipeline to complete."""
    logger.info(f"[{paper_id[:8]}] Waiting for full arXiv pipeline to complete...")
    result = await job.result(timeout=1800, poll_delay=2.0)  # 30 minutes timeout
    return result


@router.post("/upload_arxiv_to_video")
async def upload_arxiv_to_video(
    request: Request,
    arxiv_url: str = Form(...),
    tts_source: str = Form(...),
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user)
):
    """Upload arXiv URL and generate video with optional TTS source."""
    
    # Validate TTS source
    tts_source = tts_source.lower().strip()
    if tts_source not in ["sarvam", "bhashini"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid tts_source. Must be 'sarvam' or 'bhashini'."
        )
    
    # Override for testing (remove in production)
    tts_source = "sarvam"
    logger.info(f"Using TTS source: {tts_source}")
    
    # Validate arXiv URL
    if not any(domain in arxiv_url for domain in ['arxiv.org', 'biorxiv.org', 'medrxiv.org']):
        raise HTTPException(
            status_code=400,
            detail="Invalid URL. Must be from arxiv.org, biorxiv.org, or medrxiv.org"
        )
    
    paper_id = str(uuid.uuid4())
    
    # Get API keys from environment
    api_keys = {
        "gemini_key": os.getenv("GEMINI_API_KEY"),
        "sarvam_key": os.getenv("SARVAM_API_KEY"),
        "openai_key": os.getenv("OPENAI_API_KEY")
    }

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        user_ctx_early = get_user_context(request, current_user)
        init_pipeline_tracking(paper_id, user_id=user_ctx_early.get('user_id'))

        # Validate Gemini API key
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        # Get worker pool
        pool = await get_worker_pool()
        
        # Enqueue job to worker (tracked)
        job = await enqueue_arxiv_to_video_job(pool, arxiv_url, paper_id, tts_source, api_keys)
        
        # Wait for job to complete (tracked)
        result = await wait_for_arxiv_pipeline_result(job, paper_id)
        
        # Process result
        if result and result.get('status') == 'success':
            logger.info(f"[{paper_id[:8]}] arXiv pipeline completed successfully")
            
            # Track paper upload and output generation
            user_ctx = get_user_context(request, current_user)
            track_paper_upload(
                paper_id=paper_id,
                user_id=user_ctx.get('user_id'),
                user_email=user_ctx.get('user_email'),
                session_id=user_ctx.get('session_id'),
                source_type='arxiv',
                filename=arxiv_url
            )
            
            track_output_generation(
                paper_id=paper_id,
                output_type='video',
                user_id=user_ctx.get('user_id')
            )
            

            video_info = result.get('video_info')
            return video_info
        else:
            error_detail = result.get('error', 'arXiv pipeline failed or returned no result') if isinstance(result, dict) else 'arXiv pipeline failed or returned no result'
            try:
                mark_pipeline_failed(paper_id, "video_generation", Exception(error_detail), started_at=_step_started_at)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise HTTPException(
                status_code=500,
                detail=error_detail
            )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] Error processing arXiv paper: {str(e)}")
        mark_pipeline_failed(paper_id, "video_generation", e, started_at=_step_started_at)
        temp_dir = f"temp/papers/{paper_id}"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing arXiv paper: {str(e)}"
        )


@track_performance
async def save_uploaded_pdf(file: UploadFile, pdf_path: str):
    """Track file upload/save time."""
    with open(pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)


@track_performance
async def enqueue_pdf_to_video_job(pool, pdf_path: str, paper_id: str, tts_source: str, api_keys: dict):
    """Track job enqueueing."""
    logger.info(f"[{paper_id[:8]}] Enqueuing PDF to video job")
    return await pool.enqueue_job(
        'process_pdf_to_video_full_task',
        pdf_path,
        paper_id,
        tts_source,
        api_keys,
        _queue_name='pdf_to_video_queue'
    )


@track_performance
async def wait_for_video_pipeline_result(job, paper_id: str):
    """Track time waiting for the entire video pipeline to complete."""
    logger.info(f"[{paper_id[:8]}] Waiting for full pipeline to complete...")
    result = await job.result(timeout=1800, poll_delay=2.0)  # 30 minutes timeout
    return result


@router.post("/upload_pdf_to_video_ttsOptional")
async def upload_pdf_file_to_video_optional(
    request: Request,
    file: UploadFile = File(...),
    tts_source: str = Form(...),
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user)
):
    """Upload PDF and generate video with optional TTS source."""
    
    # Validate TTS source
    tts_source = tts_source.lower().strip()
    if tts_source not in ["sarvam", "bhashini"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid tts_source. Must be 'sarvam' or 'bhashini'."
        )
    
    # Override for testing (remove in production)
    tts_source = "sarvam"
    logger.info(f"Using TTS source: {tts_source}")
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    # Get API keys from environment
    api_keys = {
        "gemini_key": os.getenv("GEMINI_API_KEY"),
        "sarvam_key": os.getenv("SARVAM_API_KEY"),
        "openai_key": os.getenv("OPENAI_API_KEY")
    }

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        user_ctx_early = get_user_context(request, current_user)
        init_pipeline_tracking(paper_id, user_id=user_ctx_early.get('user_id'))

        # Save uploaded PDF file (tracked)
        pdf_path = os.path.join(temp_dir, file.filename)
        await save_uploaded_pdf(file, pdf_path)
        
        # Validate Gemini API key
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        # Get worker pool
        pool = await get_worker_pool()
        
        # Enqueue job to worker (tracked)
        job = await enqueue_pdf_to_video_job(pool, pdf_path, paper_id, tts_source, api_keys)
        
        # Wait for job to complete (tracked)
        result = await wait_for_video_pipeline_result(job, paper_id)
        
        # Process result
        if result and result.get('status') == 'success':
            logger.info(f"[{paper_id[:8]}] Pipeline completed successfully")
            
            # Track paper upload and output generation
            user_ctx = get_user_context(request, current_user)
            track_paper_upload(
                paper_id=paper_id,
                user_id=user_ctx.get('user_id'),
                user_email=user_ctx.get('user_email'),
                session_id=user_ctx.get('session_id'),
                source_type='pdf',
                filename=file.filename
            )
            
            track_output_generation(
                paper_id=paper_id,
                output_type='video',
                user_id=user_ctx.get('user_id')
            )
            

            video_info = result.get('video_info')
            return video_info
        else:
            error_detail = result.get('error', 'Pipeline failed or returned no result') if isinstance(result, dict) else 'Pipeline failed or returned no result'
            try:
                mark_pipeline_failed(paper_id, "video_generation", Exception(error_detail), started_at=_step_started_at)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise HTTPException(
                status_code=500,
                detail=error_detail
            )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] Error processing PDF file: {str(e)}")
        mark_pipeline_failed(paper_id, "video_generation", e, started_at=_step_started_at)
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Error processing PDF file: {str(e)}"
        )



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


@router.post("/upload-pdf", response_model=PaperResponse)
async def upload_pdf_file(
    file: UploadFile = File(...),
    paper_id: str = Form(...),
    api_keys: dict = Depends(get_api_keys),
):
    """Upload and process a PDF file of a research paper."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # paper_id = str(uuid.uuid4())
    paper_temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(paper_temp_dir, exist_ok=True)
    
    try:
        # Save uploaded PDF file
        pdf_path = os.path.join(paper_temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")

        # Process the PDF file
        result = await process_pdf_file(pdf_path, paper_id, "paper", gemini_api_key)
        #result = await process_pdf_file(pdf_path, paper_id)
        
        
        # Store paper info - result now contains tex_file_path for compatibility
        result["source_type"] = "pdf"  # Add source type
        save_paper_info(paper_id, result)
        
        # Log the storage info for debugging
        logger.info(f"Paper {paper_id} processed and stored with keys: {list(result.keys())}")
        
        return PaperResponse(
            paper_id=paper_id,
            metadata=PaperMetadata(**result["metadata"]),
            image_files=[os.path.basename(f) for f in result["image_files"]],
            tex_file_path=result["tex_file_path"],  # This should now be available
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error processing PDF file: {str(e)}")
        shutil.rmtree(paper_temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")




