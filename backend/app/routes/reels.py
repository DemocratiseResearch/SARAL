from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks , Path , Body, Request
from fastapi.responses import FileResponse
from typing import List, Dict
import tempfile
import os
import zipfile
from pathlib import Path as FilePath
import uuid
import shutil
import google.generativeai as genai
import re
from sarvamai import SarvamAI
from starlette.concurrency import run_in_threadpool
from ..services.tts_service import generate_dialogue_audio_bhashini, sarvam_tts
from app.auth.dependencies import get_current_user
from app.services.metadata_tracker import track_paper_upload, track_output_generation
from app.services.firestore_helpers import init_pipeline_tracking, update_pipeline_step, mark_pipeline_failed


import json
import traceback
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# from ..models.request_models import ReelVideoRequest
from ..services.reels_video_service import generate_dialogue_video, generate_title_video_from_text
# from ..models.request_models import ReelAudioRequest
from app.services.pdf_processor import process_pdf_file
from app.services.podcast_service import extract_text_from_pdf, clean_text, translate_dialogues_to_tamil
from app.services.podcast_service import translate_dialogues_to_hindi, bhashini_translate_dialogues, extract_pdf_metadata
from app.services.script_generator import extract_text_from_file, extract_paper_metadata
from app.services.arxiv_scraper import ArxivScraper
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from ..models.request_models import ReelScriptUpdate, ReelAvatarSelection, AvailableAvatarPair, ReelDialogueTurn
from app.utils.timing import track_performance
from app.services.voice_manager import voice_manager
from app.services.metadata_tracker import track_output_generation
from app.services.metrics_collector import metrics_collector
from app.middleware.session_tracking import get_user_context
router = APIRouter(tags=["Reels"])


from multiprocessing import Process
import asyncio
import fitz 

# from concurrent.futures import ProcessPoolExecutor
# executor = ProcessPoolExecutor(max_workers=4)

from concurrent.futures import ProcessPoolExecutor
import multiprocessing
import time


AVATAR_PAIRS = [
    AvailableAvatarPair(
        id="male1_female1",
        name="Male 1 & Female 1",
        male_avatar="prof1.png",
        female_avatar="student1.png",
        description="Two person avatar pair"
    ),
    AvailableAvatarPair(
        id="male1_female2",
        name="Male 1 & Female 2",
        male_avatar="prof1.png",
        female_avatar="student2.png",
        description="Two person avatar pair"
    ),
    AvailableAvatarPair(
        id="male2_female1",
        name="Male 2 & Female 1",
        male_avatar="prof2.png",
        female_avatar="student1.png",
        description="Two person avatar pair"
    ),
    AvailableAvatarPair(
        id="male2_female2",
        name="Male 2 & Female 2",
        male_avatar="prof2.png",
        female_avatar="student2.png",
        description="Two person avatar pair"
    ),
]

@track_performance
def get_avatar_pair_by_id(avatar_pair_id: str) -> AvailableAvatarPair:
    """Get avatar pair by ID, raise HTTPException if not found"""
    for pair in AVATAR_PAIRS:
        if pair.id == avatar_pair_id:
            return pair
    raise HTTPException(status_code=400, detail=f"Invalid avatar pair ID: {avatar_pair_id}")


# Status tracking helpers
@track_performance
def get_status_file_path(paper_id: str) -> str:
    """Get the path to the status file for a paper_id"""
    status_dir = "temp/status"
    os.makedirs(status_dir, exist_ok=True)
    return os.path.join(status_dir, f"{paper_id}.json")

@track_performance
def update_job_status(paper_id: str, status: str, **kwargs):
    """Update the status of a job - PRESERVES existing data from file"""
    status_file = get_status_file_path(paper_id)
    
    print(f"[DEBUG] update_job_status called with status={status}, kwargs keys={list(kwargs.keys())}")
    

    existing_data = {}
    if os.path.exists(status_file):
        try:
            with open(status_file, "r") as f:
                existing_data = json.load(f)
            print(f"[DEBUG] Loaded existing status file with keys: {list(existing_data.keys())}")
        except Exception as e:
            print(f"[DEBUG] Could not load existing file (first write?): {str(e)}")
            existing_data = {}
    
    #  new data by merging with existing
    data = existing_data.copy()  
    data["paper_id"] = paper_id
    data["status"] = status
    data["updated_at"] = datetime.utcnow().isoformat()
    data.update(kwargs)  # Then override/add new values
    
    if "script_data" in kwargs:
        script_data = kwargs["script_data"]
        print(f"[DEBUG] script_data received: type={type(script_data)}, keys={list(script_data.keys()) if isinstance(script_data, dict) else 'NOT A DICT'}")
        if isinstance(script_data, dict):
            print(f"[DEBUG] script_data['parsed_script'] exists: {'parsed_script' in script_data}")
            if "parsed_script" in script_data:
                print(f"[DEBUG] parsed_script items: {len(script_data['parsed_script'])} turns")
    
    try:
        with open(status_file, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[STATUS] Updated status for {paper_id}: {status}")
        print(f"[DEBUG] File written successfully. Total data keys saved: {list(data.keys())}")
        
        # Verify write by reading back
        with open(status_file, "r") as f:
            verified = json.load(f)
        print(f"[DEBUG] Verification read back - keys: {list(verified.keys())}")
        if "script_data" in verified:
            print(f"[DEBUG] Verification confirmed - script_data saved successfully")
        
    except Exception as e:
        print(f"[ERROR] Failed to update status for {paper_id}: {str(e)}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")

@track_performance
def get_job_status(paper_id: str) -> dict:
    """Get the status of a job"""
    status_file = get_status_file_path(paper_id)
    
    if not os.path.exists(status_file):
        return None
    
    with open(status_file, "r") as f:
        return json.load(f)

@track_performance
def sync_generate_reel_script(temp_pdf_path=None, language="english", paper_id=None, paper_text=None):
    print(f"\n[PROCESS] ========== PROCESS STARTED: sync_generate_reel_script for paper_id = {paper_id} ==========")
    _step_started_at = datetime.now()
    try:
        print(f"[PROCESS] Starting script generation for paper_id = {paper_id}")
        try:
            update_pipeline_step(
                paper_id, "reel_script_generation",
                metadata={"language": language},
                started_at=_step_started_at, status="in_progress"
            )
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        start_time = time.time()
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            update_job_status(
                paper_id=paper_id,
                status="failed",
                stage="error",
                error_message="Missing GEMINI_API_KEY",
                completed_at=datetime.utcnow().isoformat()
            )
            return

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            extract_start = time.time()
            # Support both PDF and pre-extracted text
            if paper_text:
                print(f"[DEBUG] Using pre-extracted text (length: {len(paper_text)})")
            else:
                paper_text = extract_text_from_pdf(temp_pdf_path)
                print(f"[TIMER] Text extraction took: {time.time() - extract_start:.2f}s")
            
            if not paper_text or len(paper_text.strip()) < 100:
                update_job_status(
                    paper_id=paper_id,
                    status="failed",
                    stage="error",
                    error_message="PDF too small or empty",
                    completed_at=datetime.utcnow().isoformat()
                )
                return
            
            update_job_status(
                paper_id=paper_id,
                status="processing",
                stage="text extracted"
            )
            
            clean_start = time.time()
            paper_text = loop.run_until_complete(clean_text(paper_text))
            print(f"[TIMER] Text cleaning took: {time.time() - clean_start:.2f}s")


            update_job_status(
                paper_id=paper_id,
                status="processing",
                stage="generating dialogue"
            )

            dialogue_start = time.time()
            print(f"[DEBUG] Generating dialogue in {language}...")
            reel_dialogue = loop.run_until_complete(
                generate_reel_dialogue_with_fallback(gemini_api_key, paper_text, language)
            )
            print(f"[TIMER] Dialogue generation took: {time.time() - dialogue_start:.2f}s")
            print(f"[DEBUG] Dialogue generated (not translated): {reel_dialogue[:100]}...")

            parse_dialogue_start = time.time()
            # Convert to script
            dialogue_script = loop.run_until_complete(parse_dialogue_to_script(reel_dialogue))
            print(f"[TIMER] Script parsing took: {time.time() - parse_dialogue_start:.2f}s")

            # Convert to list of dicts for storage
            script_list = [
                {"character": turn.get("character"), "dialogue": turn.get("dialogue")}
                for turn in dialogue_script
            ]

            # Update status to script_ready
            update_job_status(
                paper_id=paper_id,
                status="script_ready",
                stage="script generated",
                script_data={
                    "original_dialogue": reel_dialogue,
                    "parsed_script": script_list
                },
                completed_at=datetime.utcnow().isoformat()
            )
            try:
                update_pipeline_step(
                    paper_id, "reel_script_generation",
                    metadata={"language": language, "turns": len(script_list)},
                    started_at=_step_started_at, status="completed"
                )
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            total_time = time.time() - start_time
            print(f"[TIMER] Total script generation took: {total_time:.2f}s")
            print(f"\n[PROCESS] ========== Script generation SUCCEEDED for {paper_id} ==========\n")
            
        finally:
            loop.close()

    except Exception as e:
        print(f"\n[PROCESS] ========== Script generation FAILED for {paper_id} ==========")
        print(f"[PROCESS ERROR] Exception: {str(e)}")
        print(f"[PROCESS ERROR] Traceback:\n{traceback.format_exc()}")
        print(f"========== END ERROR ==========\n")
        traceback.print_exc()
        
        update_job_status(
            paper_id=paper_id,
            status="failed",
            error_message=str(e),
            completed_at=datetime.utcnow().isoformat()
        )
        try:
            mark_pipeline_failed(paper_id, "reel_script_generation", e, started_at=_step_started_at)
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")

@track_performance
def sync_generate_reel_video(paper_id, language, avatar_pair_id):
    """Generate audio and video using stored script and selected avatars"""
    _step_started_at = datetime.now()
    _reel_audio_start = None
    try:
        print(f"\n[PROCESS] ========== Starting video generation for paper_id = {paper_id} ==========")
        try:
            update_pipeline_step(
                paper_id, "reel_video_generation",
                metadata={"language": language, "avatar_pair_id": avatar_pair_id},
                started_at=_step_started_at, status="in_progress"
            )
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        start_time = time.time()
        print(f"[DEBUG] Retrieving job status from disk...")
        job_status = None
        max_retries = 3
        retry_delay = 0.5
        
        for attempt in range(max_retries):
            job_status = get_job_status(paper_id)
            if job_status:
                print(f"[DEBUG] Successfully loaded job status on attempt {attempt + 1}")
                break
            if attempt < max_retries - 1:
                print(f"[DEBUG] Job status not found, retrying in {retry_delay}s... (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
        
        if not job_status:
            error_msg = "Job status file not found after retries"
            print(f"[ERROR] {error_msg}")
            update_job_status(
                paper_id=paper_id,
                status="failed",
                error_message=error_msg,
                completed_at=datetime.utcnow().isoformat()
            )
            return
        
        
        script_data = job_status.get("script_data", {})
        
        # Use edited script if available, otherwise use parsed script
        dialogue_script = []
        if "edited_script" in script_data and script_data["edited_script"]:
            dialogue_script = script_data["edited_script"]
            print(f"[DEBUG] Using edited_script with {len(dialogue_script)} turns")
        elif "parsed_script" in script_data and script_data["parsed_script"]:
            dialogue_script = script_data.get("parsed_script", [])
            print(f"[DEBUG] Using parsed_script with {len(dialogue_script)} turns")
        else:
            print(f"[DEBUG] Neither edited_script nor parsed_script found!")
            print(f"[DEBUG] Available script_data keys: {script_data.keys() if script_data else 'EMPTY DICT'}")
        
        if not dialogue_script:
            error_msg = f"No script found for video generation. script_data={script_data}"
            print(f"[ERROR] {error_msg}")
            update_job_status(
                paper_id=paper_id,
                status="failed",
                error_message="No script found for video generation",
                completed_at=datetime.utcnow().isoformat()
            )
            return
        
        print(f"[DEBUG] Successfully loaded {len(dialogue_script)} dialogue turns")

        print(f"[DEBUG] Retrieving avatar pair: {avatar_pair_id}")
        try:
            avatar_pair = get_avatar_pair_by_id(avatar_pair_id)
            print(f"[DEBUG] Avatar pair found: male={avatar_pair.male_avatar}, female={avatar_pair.female_avatar}")
        except HTTPException as e:
            error_msg = f"Invalid avatar selection: {str(e.detail)}"
            print(f"[ERROR] {error_msg}")
            update_job_status(
                paper_id=paper_id,
                status="failed",
                error_message=error_msg,
                completed_at=datetime.utcnow().isoformat()
            )
            return

        character_mapping = {
            # "Rohan": avatar_pair.male_avatar,
            # "Aisha": avatar_pair.female_avatar,
            "Person2": avatar_pair.male_avatar,
            "Person1": avatar_pair.female_avatar
        }
        print(f"[DEBUG] Character mapping created: {character_mapping}")

        print(f"[DEBUG] Starting audio generation...")
        update_job_status(
            paper_id=paper_id,
            status="processing",
            stage="generating audio"
        )
        
        _reel_audio_start = datetime.now()
        try:
            update_pipeline_step(paper_id, "reel_audio_generation",
                metadata={"language": language, "avatar_pair_id": avatar_pair_id},
                started_at=_reel_audio_start, status="in_progress")
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")

        audio_start = time.time()
        output_dir = FilePath(f"temp/audio/{paper_id}")
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"[DEBUG] Audio output directory: {output_dir}")

        male_voice, female_voice = voice_manager.get_voice_pair()
        print(f"[REEL] Using voices - Male: {male_voice}, Female: {female_voice}")

        # Build segments list for audio worker dispatch
        _reel_segments = [
            {
                "text": turn.get("dialogue", "").strip(),
                "voice": male_voice if turn.get("character") == "Person2" else female_voice,
                "output_path": os.path.join(str(output_dir), f"{index:02d}_{turn.get('character')}.wav"),
            }
            for index, turn in enumerate(dialogue_script)
            if turn.get("character") and turn.get("dialogue", "").strip()
        ]

        sarvam_api_key_reel = os.getenv("SARVAM_API_KEY")
        if not sarvam_api_key_reel:
            raise RuntimeError("SARVAM_API_KEY not configured for audio worker dispatch")

        import asyncio as _asyncio_reel
        from arq import create_pool as _arq_pool_reel
        from arq.connections import RedisSettings as _ArqRS_reel

        print(f"[REEL] Dispatching {len(_reel_segments)} segments to audio worker")
        _loop_reel = _asyncio_reel.new_event_loop()
        try:
            _pool_reel = _loop_reel.run_until_complete(
                _arq_pool_reel(_ArqRS_reel(host='localhost', port=6379, database=0))
            )
            _job_reel = _loop_reel.run_until_complete(
                _pool_reel.enqueue_job(
                    'generate_dialogue_audio_task',
                    paper_id,
                    sarvam_api_key_reel,
                    language,
                    _reel_segments,
                    str(output_dir),
                    "reel_audio_generation",
                    "AUDIO_WORKER_REEL",
                    _queue_name='audio_generation_queue',
                )
            )
            _reel_audio_result = _loop_reel.run_until_complete(_job_reel.result(timeout=600, poll_delay=1.0))
            _loop_reel.run_until_complete(_pool_reel.close())
        finally:
            _loop_reel.close()

        audio_count = len(_reel_audio_result.get("audio_files", []))
        
        audio_time = time.time() - audio_start
        print(f"[TIMER] Audio generation took: {audio_time:.2f}s ({audio_count} audio files generated)")
        try:
            update_pipeline_step(paper_id, "reel_audio_generation",
                metadata={"language": language, "audio_files_count": audio_count, "avatar_pair_id": avatar_pair_id},
                started_at=_reel_audio_start, status="completed")
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        
        # List all generated audio files
        if os.path.exists(output_dir):
            audio_files = os.listdir(output_dir)
            print(f"[DEBUG] Audio files in {output_dir}: {audio_files}")

        # Generate title background video
        # Check source type to determine how to get metadata
        source_type = job_status.get('source_type', 'pdf')
        print(f"[DEBUG] Source type: {source_type}")
        
        if source_type in ['arxiv', 'latex']:
            # For arXiv/LaTeX sources, check if metadata was stored during upload
            # First try to get the stored metadata from the status file
            stored_metadata = job_status.get('metadata', {})
            
            if stored_metadata:
                print(f"[DEBUG] Using stored metadata from status file")
                metadata = stored_metadata
                print(f"[DEBUG] Title: {metadata.get('title', 'N/A')}")
                print(f"[DEBUG] Authors: {metadata.get('authors', 'N/A')}")
            elif source_type == 'arxiv':
                # Fallback: check for arxiv_metadata key
                stored_metadata = job_status.get('arxiv_metadata', {})
                if stored_metadata:
                    print(f"[DEBUG] Using stored arXiv metadata")
                    metadata = stored_metadata
                    print(f"[DEBUG] Title: {metadata.get('title', 'N/A')[:50]}...")
                else:
                    print(f"[DEBUG] No stored metadata, using default")
                    metadata = {
                        "title": "arXiv Paper",
                        "authors": "Authors",
                        "date": "2024"
                    }
            elif source_type == 'latex':
                # Fallback: use filename as title
                latex_filename = job_status.get('filename', '')
                print(f"[DEBUG] Using LaTeX filename for metadata")
                metadata = {
                    "title": latex_filename.replace('.zip', '').replace('_', ' ') if latex_filename else "Research Paper",
                    "authors": "Authors",
                    "date": "2024"
                }
        else:
            # For PDF sources, extract metadata from PDF
            print(f"[DEBUG] Loading PDF metadata from temp/papers/{paper_id}/...")
            filename = job_status.get('filename', '')
            print(f"[DEBUG] PDF filename from status: {filename}")
            
            pdf_path = f"temp/papers/{paper_id}/{filename}"
            if os.path.exists(pdf_path):
                doc = fitz.open(pdf_path)
                metadata = extract_pdf_metadata(doc)
                doc.close()
            else:
                # Fallback to default metadata if PDF not found
                print(f"[DEBUG] PDF file not found, using default metadata")
                metadata = {
                    "title": "Research Paper",
                    "authors": "Authors",
                    "date": "2024"
                }
        
        print(f"[DEBUG] Metadata: {metadata}")
        
        output_dir_title = FilePath(f"temp/reels/{paper_id}")
        output_dir_title.mkdir(parents=True, exist_ok=True)
        output_file = output_dir_title / "title_bg.mp4"
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        
        print(f"[DEBUG] Generating title video background...")
        reel_bg_path = generate_title_video_from_text(
            paper_text=metadata,
            paper_id=paper_id,
            gemini_api_key=gemini_api_key,
            out_dir=str(output_file),
            duration=120,
        )
        print(f"[DEBUG] Title background video path: {reel_bg_path}")

        # Generate video with selected avatars
        print(f"[DEBUG] Updating status to 'generating video'...")
        update_job_status(
            paper_id=paper_id,
            status="processing",
            stage="generating video"
        )
        
        video_start = time.time()
        print(f"[DEBUG] Calling generate_dialogue_video with character_mapping={character_mapping}")
        video_path = generate_dialogue_video(
            paper_id,
            len(dialogue_script),
            reel_bg_path,
            character_mapping=character_mapping
        )
        video_time = time.time() - video_start
        print(f"[TIMER] Video generation took: {video_time:.2f}s")
        print(f"[DEBUG] Video path returned: {video_path}")

        # Read user_id from job status file (saved by the request handler)
        job_status = get_job_status(paper_id)
        tracking_user_id = job_status.get('user_id') if job_status else None
        
        # Track output generation
        try:
            track_output_generation(
                paper_id=paper_id,
                output_type='reels',
                file_path=video_path,
                user_id=tracking_user_id
            )
        except Exception as e:
            print(f"[WARNING] Failed to track output generation: {e}")

       
        print(f"[DEBUG] Updating status to 'completed'...")
        update_job_status(
            paper_id=paper_id,
            status="completed",
            video_path=video_path,
            completed_at=datetime.utcnow().isoformat(),
            stage="done"
        )
        total_time = time.time() - start_time
        print(f"[TIMER] Total video generation took: {total_time:.2f}s")
        print(f"\n[PROCESS] ========== Video generation SUCCEEDED for {paper_id} ==========\n")
        try:
            update_pipeline_step(
                paper_id, "reel_video_generation",
                metadata={"language": language, "video_path": str(video_path)},
                started_at=_step_started_at, status="completed"
            )
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        
    except Exception as e:
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"\n[PROCESS] ========== Video generation FAILED for {paper_id} ==========")
        print(f"[PROCESS ERROR] Exception: {str(e)}")
        print(f"[PROCESS ERROR] Traceback:\n{traceback.format_exc()}")
        print(f"========== END ERROR ==========\n")
        traceback.print_exc()
        
        update_job_status(
            paper_id=paper_id,
            status="failed",
            error_message=str(e),
            completed_at=datetime.utcnow().isoformat()
        )
        try:
            mark_pipeline_failed(paper_id, "reel_video_generation", e, started_at=_step_started_at)
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        if _reel_audio_start is not None:
            try:
                mark_pipeline_failed(paper_id, "reel_audio_generation", e, started_at=_reel_audio_start)
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")



@router.post("/generate_reel_from_pdf", 
    summary="STEP 1: Upload PDF and Generate Script",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "Script generation started successfully",
            "content": {
                "application/json": {
                    "example": {
                        "status": "processing",
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "message": "Script generation started. Use paper_id to check status."
                    }
                }
            }
        },
        400: {"description": "Invalid file format or missing file"}
    }
)
async def generate_reel_from_pdf(
    request: Request,
    file: UploadFile = File(..., description="PDF file to convert to reel"),
    language: str = Form("english", description="Target language for dialogue (english, hindi, tamil, etc.)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a PDF and generate script with dialogue.
    
    **STEP 1** of the reel generation workflow.
    
    - Accepts a PDF file
    - Extracts text and metadata
    - Generates a short-form dialogue using Gemini AI
    - Returns paper_id for tracking
    
    The script generation happens asynchronously in the background.
    Use the returned paper_id with GET /reel_status/{paper_id} to check progress.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    temp_pdf_path = os.path.join(temp_dir, file.filename)

    try:
        with open(temp_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving uploaded PDF: {str(e)}")

    # Extract user context for Firestore tracking
    user_ctx = get_user_context(request, current_user)
    
    # Initialize status (include user_id so background process can read it)
    print(f"[DEBUG] Initializing status file for paper_id={paper_id}")
    update_job_status(
        paper_id=paper_id,
        status="processing",
        stage="pdf process",
        language=language,
        created_at=datetime.utcnow().isoformat(),
        filename=file.filename,
        user_id=user_ctx.get('user_id'),
        user_email=user_ctx.get('user_email')
    )
    
    # Track paper upload in Firestore so dashboard can find it
    track_paper_upload(
        paper_id=paper_id,
        user_id=user_ctx.get('user_id'),
        user_email=user_ctx.get('user_email'),
        session_id=user_ctx.get('session_id'),
        source_type='pdf',
        filename=file.filename
    )
    init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
    
    print(f"[DEBUG] Status file initialized, starting background process...")

    # Start script generation in separate process (STEP 1 only)
    process = Process(
        target=sync_generate_reel_script,
        args=(temp_pdf_path, language, paper_id)
    )
    process.start()
    # Don't wait for it - let it run independently
    print(f"[DEBUG] Script generation process started for paper_id={paper_id}")

    return {
        "status": "processing",
        "paper_id": paper_id,
        "message": "Script generation started. Use paper_id to check status."
    }


@router.get("/reel_script/{paper_id}",
    summary="STEP 2: Get Generated Script",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "Script retrieved successfully",
            "content": {
                "application/json": {
                    "example": {
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "status": "script_ready",
                        "script": [
                            {"character": "Aisha", "dialogue": "Did you know...?"},
                            {"character": "Rohan", "dialogue": "That's amazing!"}
                        ]
                    }
                }
            }
        },
        404: {"description": "Job not found"}
    }
)
async def get_reel_script(paper_id: str = Path(..., description="Unique identifier from PDF upload")):
    """
    Get the generated script for review before editing.
    
    **STEP 2** of the reel generation workflow.
    
    - Retrieves the AI-generated dialogue script
    - Shows character-dialogue pairs
    - Ready for review and optional editing
    """
    status = get_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if status.get("status") not in ["script_ready", "script_edited", "avatars_selected", "processing", "completed", "failed"]:
        raise HTTPException(
            status_code=400,
            detail=f"Script not yet ready. Current status: {status.get('status')}"
        )
    
    script_data = status.get("script_data", {})
    
    response = {
        "paper_id": paper_id,
        "status": status.get("status"),
        "stage": status.get("stage"),
        "language": status.get("language"),
        "script": script_data.get("parsed_script", []),
        "edited_script": script_data.get("edited_script"),
    }
    
    if status.get("status") == "failed":
        response["error_message"] = status.get("error_message")
    
    return response


@router.put("/reel_script/{paper_id}",
    summary="STEP 2: Edit Generated Script",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "Script updated successfully",
            "content": {
                "application/json": {
                    "example": {
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "status": "script_edited",
                        "message": "Script updated successfully"
                    }
                }
            }
        },
        400: {"description": "Invalid script format or wrong status"},
        404: {"description": "Job not found"}
    }
)
async def update_reel_script(
    paper_id: str = Path(..., description="Unique identifier from PDF upload"),
    request: ReelScriptUpdate = Body(..., description="Updated dialogue script with character-dialogue pairs")
):
    """
    Edit the generated script before proceeding to avatar selection.
    
    **STEP 2** of the reel generation workflow (optional).
    
    - Modify dialogue lines
    - Change character assignments (Person1 , Person2)
    - Validate format before saving
    
    **Character options**: "Person1", "Person2"
    """
    status = get_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if status.get("status") not in ["script_ready", "script_edited"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit script at current status: {status.get('status')}"
        )
    
    # Validate script format
    for turn in request.script:
        if turn.character not in ["Person1", "Person2"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid character: {turn.character}. Must be 'Person1' or 'Person2'"
            )
        if not turn.dialogue.strip():
            raise HTTPException(status_code=400, detail="Dialogue cannot be empty")
    
    # Convert to dicts
    edited_script = [
        {"character": turn.character, "dialogue": turn.dialogue}
        for turn in request.script
    ]
    
    # Update the script data with edited version
    script_data = status.get("script_data", {})
    script_data["edited_script"] = edited_script
    
    update_job_status(
        paper_id=paper_id,
        status="script_edited",
        stage="script edited",
        script_data=script_data,
        updated_at=datetime.utcnow().isoformat()
    )
    
    return {
        "paper_id": paper_id,
        "status": "script_edited",
        "message": "Script updated successfully",
        "script": edited_script
    }


@router.get("/available_avatars",
    summary="STEP 3: Get Available Avatar Pairs",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "List of available avatar combinations",
            "content": {
                "application/json": {
                    "example": {
                        "avatar_pairs": [
                            {
                                "id": "prof1_student1",
                                "name": "Professor 1 & Student 1",
                                "male_avatar": "prof1.png",
                                "female_avatar": "student1.png"
                            }
                        ]
                    }
                }
            }
        }
    }
)
async def get_available_avatars():
    """
    Retrieve all available avatar pair combinations.
    
    **STEP 3** of the reel generation workflow.
    
    **Avatar Pairing Rules:**
    - Male voices (Rohan/K) → prof1.png or prof2.png
    - Female voices (Aisha/A) → student1.png or student2.png
    - Valid combinations: 4 total pairs
    
    Returns all valid avatar pair IDs for selection.
    """
    return {
        "avatar_pairs": [
            {
                "id": pair.id,
                "name": pair.name,
                "male_avatar": pair.male_avatar,
                "female_avatar": pair.female_avatar,
                "description": pair.description
            }
            for pair in AVATAR_PAIRS
        ]
    }


@router.post("/reel_avatar_selection/{paper_id}",
    summary="STEP 3: Select Avatar Pair",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "Avatar pair selected successfully",
            "content": {
                "application/json": {
                    "example": {
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "status": "avatars_selected",
                        "message": "Avatars selected successfully"
                    }
                }
            }
        },
        400: {"description": "Invalid avatar pair ID or wrong status"},
        404: {"description": "Job not found"}
    }
)
async def select_reel_avatars(
    paper_id: str = Path(..., description="Unique identifier from PDF upload"),
    request: ReelAvatarSelection = Body(..., description="Selected avatar pair ID")
):
    """
    Select the avatar pair for the reel.
    
    **STEP 3** of the reel generation workflow.
    
    **Valid avatar_pair_id values:**
    - prof1_student1 (Professor 1 & Student 1)
    - prof1_student2 (Professor 1 & Student 2)
    - prof2_student1 (Professor 2 & Student 1)
    - prof2_student2 (Professor 2 & Student 2)
    
    Maps male character to prof avatar and female character to student avatar.
    """
    status = get_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if status.get("status") not in ["script_ready", "script_edited"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot select avatars at current status: {status.get('status')}"
        )
    
    try:
        avatar_pair = get_avatar_pair_by_id(request.avatar_pair_id)
    except HTTPException:
        raise HTTPException(status_code=400, detail=f"Invalid avatar pair ID: {request.avatar_pair_id}")
    
    update_job_status(
        paper_id=paper_id,
        status="avatars_selected",
        stage="avatars selected",
        avatar_selection={
            "avatar_pair_id": request.avatar_pair_id,
            "male_avatar": avatar_pair.male_avatar,
            "female_avatar": avatar_pair.female_avatar
        },
        updated_at=datetime.utcnow().isoformat()
    )
    
    return {
        "paper_id": paper_id,
        "status": "avatars_selected",
        "message": "Avatars selected successfully",
        "avatar_pair": {
            "id": avatar_pair.id,
            "name": avatar_pair.name,
            "male_avatar": avatar_pair.male_avatar,
            "female_avatar": avatar_pair.female_avatar
        }
    }


@router.post("/reel_finalize/{paper_id}",
    summary="STEP 4: Finalize and Generate Video",
    tags=["Reel Generation"],
    responses={
        200: {
            "description": "Video generation started",
            "content": {
                "application/json": {
                    "example": {
                        "status": "processing",
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "message": "Reel finalization started. Video generation in progress."
                    }
                }
            }
        },
        400: {"description": "Missing avatar selection or wrong status"},
        404: {"description": "Job not found"}
    }
)
async def finalize_reel_generation(paper_id: str = Path(..., description="Unique identifier from PDF upload")):
    """
    Start audio and video generation with selected avatars.
    
    **STEP 4** of the reel generation workflow.
    
    This endpoint:
    - Generates audio from the script using Sarvam TTS
    - Creates title background video
    - Composites avatars with audio
    - Saves final MP4 file
    
    Video generation happens asynchronously. Monitor progress with GET /reel_status/{paper_id}
    """
    status = get_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if status.get("status") != "avatars_selected":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot finalize at current status: {status.get('status')}. Avatar selection required first."
        )
    
    avatar_selection = status.get("avatar_selection", {})
    avatar_pair_id = avatar_selection.get("avatar_pair_id")
    language = status.get("language", "english")
    
    if not avatar_pair_id:
        raise HTTPException(status_code=400, detail="Avatar selection not found")
    
    process = Process(
        target=sync_generate_reel_video,
        args=(paper_id, language, avatar_pair_id)
    )
    process.start()

    
    return {
        "status": "processing",
        "paper_id": paper_id,
        "message": "Reel finalization started. Video generation in progress.",
        "stage": "audio and video generation"
    }


@router.get("/reel_status/{paper_id}")
async def get_reel_status(paper_id: str):
    """Check the status of reel generation (all steps)"""
    status = get_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    response = {
        "paper_id": status.get("paper_id"),
        "status": status.get("status"),
        "stage": status.get("stage", ""),
        "language": status.get("language"),
        "created_at": status.get("created_at"),
        "updated_at": status.get("updated_at"),
    }
    
    # Add script if available
    script_data = status.get("script_data", {})
    if script_data.get("parsed_script"):
        response["script"] = script_data.get("parsed_script")
    
    # Add avatar selection if available
    avatar_selection = status.get("avatar_selection", {})
    if avatar_selection:
        response["avatar_selection"] = avatar_selection
    
    if status.get("status") == "completed":
        response["completed_at"] = status.get("completed_at")
        response["video_path"] = status.get("video_path")
        response["download_url"] = f"/download_reel/{paper_id}"
        
        # Track output metric in main process (child process counters are lost)
        if not status.get("metrics_tracked"):
            try:
                metrics_collector.record_output_generation("reels")
                update_job_status(
                    paper_id=paper_id,
                    status="completed",
                    metrics_tracked=True
                )
            except Exception as e:
                logger.warning(f"Failed to track reel metrics for {paper_id}: {e}")
    
    if status.get("status") == "failed":
        response["error_message"] = status.get("error_message")
    
    return response



async def generate_reel_dialogue_with_fallback(api_key: str, paper_text: str, language: str = "english") -> str:
    """Generate short-form reel dialogue using the robust function from get_podcast with modified prompts."""
    
    # Language name mapping for Gemini prompts
    language_names = {
        "english": "English",
        "hindi": "Hindi",
        "bengali": "Bengali",
        "tamil": "Tamil",
        "telugu": "Telugu",
        "kannada": "Kannada",
        "malayalam": "Malayalam",
        "marathi": "Marathi",
        "gujarati": "Gujarati",
        "punjabi": "Punjabi",
        "odia": "Odia"
    }
    
    target_language = language_names.get(language.lower(), "English")
    language_note = "" if language.lower() == "english" else f"\n\n**IMPORTANT: Generate the dialogue ENTIRELY in {target_language}, not in English. Every single line must be in {target_language}.**"
    
    
    try:
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        system_prompt = f"""
            You are a skilled content creator specializing in short-form educational content for social media reels.

            Your task is to generate a quick, engaging, and punchy dialogue between two speakers — 
            Aisha and Rohan — as they discuss the key highlights of a research paper in a reel format.

            Dialogue Requirements:
            - Generate a SHORT dialogue with exactly 6-8 exchanges between speakers (perfect for 30-60 second reels)
            - Each dialogue line should be 15-25 words maximum (for quick delivery)
            - Use alternating lines with clear speaker tags (Aisha:, Rohan:)
            - Make it conversational, energetic, and hook-focused
            - Start with an attention-grabbing hook
            - Focus on the most interesting/surprising finding from the paper
            - End with a strong takeaway or call-to-action
            - Use simple, accessible language - no jargon
            - Make each line punchy and quotable

            Content Guidelines:
            - Lead with the most shocking/interesting fact from the paper
            - Explain the core concept in the simplest terms
            - Focus on real-world impact and "why should I care?"
            - Use questions and reactions to maintain engagement
            - Keep technical explanations to absolute minimum
            - End with practical implications or future possibilities
            - Output **only the dialogue text** (no narration or stage directions)
            {language_note}

            Output Example:
            Aisha: Did you know scientists just figured out how to make batteries charge in 10 seconds?
            Rohan: Wait, what? That's impossible!
            Aisha: Not anymore! They used a new material that changes everything.
            Rohan: So my phone could charge fully in seconds?
            Aisha: Exactly! And it could last 10 times longer too.
            Rohan: This is going to revolutionize everything we use!

        """

        # Prepare the prompt
        prompt = f"""
            {system_prompt}

            Here is the research paper content to create a reel from:

            {paper_text[:6000]}  # Limit text for reel focus

            Please generate a short, engaging reel dialogue between Aisha and Rohan about the most interesting aspect of this research paper. 

            The dialogue should be 6-8 exchanges total, designed for a 60 second social media reel. Focus on the most surprising or impactful finding that would grab viewers' attention.
            """

        # Generate response
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.9,
                top_p=0.9,
                max_output_tokens=800,
            )
        )
        
        # Extract and clean the generated text
        dialogue = response.text
        
        # Remove any thinking tags if present
        dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
        
        print(f" Successfully generated reel dialogue with Gemini (length: {len(dialogue)} characters)")
        return dialogue
        
    except Exception as gemini_error:
        print(f" Gemini failed: {str(gemini_error)}")
        
        # Check if it's a quota/rate limit error
        if "429" in str(gemini_error) or "504" in str(gemini_error) or "quota" in str(gemini_error).lower() or "rate limit" in str(gemini_error).lower():
            print(" Falling back to Sarvam AI...")
            
            try:
                # Get Sarvam API key
                sarvam_api_key = os.getenv("SARVAM_API_KEY")
                if not sarvam_api_key:
                    raise Exception("SARVAM_API_KEY environment variable not set for fallback")
                
                # Use Sarvam AI as fallback
                client = SarvamAI(api_subscription_key=sarvam_api_key)
                
                # System prompt for Sarvam AI - also include language requirement
                system_prompt_clean = f"""You are a skilled content creator specializing in short-form educational content for social media reels.

Your task is to generate a quick, engaging, and punchy dialogue between two speakers — 
Aisha and Rohan — as they discuss the key highlights of a research paper in a reel format.

**CRITICAL: Generate ALL dialogue ENTIRELY in {target_language}. Every single line must be in {target_language}, not in English.**

Dialogue Requirements:
- Generate a SHORT dialogue with exactly 6-8 exchanges between speakers (perfect for 30-60 second reels)
- Each dialogue line should be 15-25 words maximum (for quick delivery)
- Use alternating lines with clear speaker tags (Aisha:, Rohan:)
- Make it conversational, energetic, and hook-focused
- Start with an attention-grabbing hook
- Focus on the most interesting/surprising finding from the paper
- End with a strong takeaway or call-to-action
- Use simple, accessible language - no jargon
- Make each line punchy and quotable

Content Guidelines:
- Lead with the most shocking/interesting fact from the paper
- Explain the core concept in the simplest terms
- Focus on real-world impact and "why should I care?"
- Use questions and reactions to maintain engagement
- Keep technical explanations to absolute minimum
- End with practical implications or future possibilities
- Output **only the dialogue text** (no narration or stage directions)

Output Example (in {target_language}):
Aisha: [Opening hook in {target_language}]
Rohan: [Reaction in {target_language}]
..."""
                                
                user_prompt = f"""
Here is the research paper content to create a reel from:

{paper_text[:6000]}

Please generate a short, engaging reel dialogue between Aisha and Rohan about the most interesting aspect of this research paper. 

The dialogue should be 12-14 exchanges total, designed for a 60 second social media reel. Focus on the most surprising or impactful finding that would grab viewers' attention.
"""
                
                res = client.chat.completions(
                    messages=[
                        {"content": system_prompt_clean, "role": "system"}, 
                        {"content": user_prompt, "role": "user"}
                    ],
                    max_tokens=800,
                )
                
                dialogue = res.choices[0].message.content
                
                # Remove any thinking tags if present
                dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
                
                print(f" Successfully generated reel dialogue with Sarvam AI (fallback) (length: {len(dialogue)} characters)")
                return dialogue
                
            except Exception as sarvam_error:
                print(f" Sarvam AI fallback also failed: {str(sarvam_error)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Both Gemini and Sarvam AI failed. Gemini: {str(gemini_error)}. Sarvam: {str(sarvam_error)}"
                )
        else:
            # For non-quota errors, just raise the original Gemini error
            raise HTTPException(status_code=500, detail=f"Error generating reel dialogue: {str(gemini_error)}")

async def parse_dialogue_to_script(dialogue: str) -> List[Dict[str, str]]:
    """Convert dialogue text to the format expected by audio generation."""
    try:
        lines = dialogue.split('\n')
        script = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if line contains speaker dialogue
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                parts = line.split(':', 1)
                speaker = parts[0].strip()
                dialogue_text = parts[1].strip()
                
                # Map speakers to characters for reel format
                # Aisha (female) -> "Person1", Rohan (male) -> "Person2"
                character = "Person1" if speaker == "Aisha" else "Person2"
                
                script.append({
                    "character": character,
                    "dialogue": dialogue_text
                })
        
        print(f" Parsed dialogue into {len(script)} script segments")
        return script
        
    except Exception as e:
        print(f" Error parsing dialogue to script: {str(e)}")
        return []

@router.get("/stream_video/{paperid}", summary="Stream Video", tags=["Reel Generation"])
async def stream_reel_video(paperid: str = Path(..., description="Unique identifier from PDF upload")):
    """Stream video file for reel playback"""
    try:
        status = get_job_status(paperid)
        if not status or status.get("status") != "completed":
            raise HTTPException(status_code=404, detail="Video not ready or not found")
        
        outputdir = FilePath(f"temp/reels/{paperid}")
        outputdir.mkdir(parents=True, exist_ok=True)
        outputfilename = "reel_output.mp4"
        filepath = outputdir / outputfilename
        
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
            
        return FileResponse(
            path=str(filepath), 
            media_type="video/mp4", 
            filename=outputfilename
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error streaming video file: {str(e)}")


@router.get("/download_video/{paper_id}")
async def download_reel_video(paper_id: str):
    """Download video file for reel"""
    try:
        output_filename = "reel_output.mp4"
        output_dir = FilePath(f"temp/reels/{paper_id}")
        os.makedirs(output_dir, exist_ok=True)
        file_path = output_dir / output_filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        return FileResponse(
            path=str(file_path),
            media_type="video/mp4",
            filename=output_filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving video file: {str(e)}")


# ==================== NEW ROUTES FOR ARXIV AND LATEX ====================

@router.post("/generate_reel_from_arxiv",
    summary="STEP 1: Generate Reel from arXiv URL",
    tags=["Reel Generation - arXiv/LaTeX"],
    responses={
        200: {
            "description": "Script generation started successfully",
            "content": {
                "application/json": {
                    "example": {
                        "status": "processing",
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "message": "Script generation started. Use paper_id to check status."
                    }
                }
            }
        },
        400: {"description": "Invalid arXiv URL"},
        500: {"description": "Error processing arXiv paper"}
    }
)
async def generate_reel_from_arxiv(
    request: Request,
    arxiv_url: str = Form(..., description="arXiv URL (e.g., https://arxiv.org/abs/2401.12345)"),
    language: str = Form("english", description="Target language for dialogue"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a reel from an arXiv paper URL.
    
    **Workflow:**
    1. Downloads arXiv source files
    2. Extracts text from LaTeX files
    3. Generates dialogue script
    4. Returns paper_id for status tracking
    
    """
    try:
        paper_id = str(uuid.uuid4())
        print(f"[ARXIV_REEL] Starting reel generation for arXiv URL: {arxiv_url}, paper_id: {paper_id}")
        
        # Initialize scraper
        scraper = ArxivScraper()
        
        # Download and extract arXiv source
        print(f"[ARXIV_REEL] Downloading arXiv source...")
        extracted_dir = scraper.download_source(arxiv_url)
        
        # Get paper metadata from arXiv page
        print(f"[ARXIV_REEL] Fetching paper metadata...")
        arxiv_metadata = scraper.get_paper_metadata(arxiv_url)
        print(f"[ARXIV_REEL] Metadata: title='{arxiv_metadata['title'][:50]}...', authors='{arxiv_metadata['authors'][:50]}...'")
        
        # Find main .tex file
        print(f"[ARXIV_REEL] Finding main .tex file...")
        tex_file_path = find_tex_file(extracted_dir)
        
        # Extract text from LaTeX file
        print(f"[ARXIV_REEL] Extracting text from LaTeX file...")
        paper_text = extract_text_from_file(tex_file_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Insufficient text extracted from arXiv paper"
            )
        
        print(f"[ARXIV_REEL] Extracted {len(paper_text)} characters from LaTeX")
        
        # Extract user context for Firestore tracking
        user_ctx = get_user_context(request, current_user)
        
        # Initialize status with metadata (include user_id so background process can read it)
        update_job_status(
            paper_id=paper_id,
            status="processing",
            language=language,
            created_at=datetime.utcnow().isoformat(),
            source_type="arxiv",
            arxiv_url=arxiv_url,
            arxiv_metadata=arxiv_metadata,
            stage="initializing",
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email')
        )
        
        # Track paper upload in Firestore so dashboard can find it
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='arxiv',
            filename=arxiv_url,
            title=arxiv_metadata.get('title')
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        # Start background process for script generation
        process = Process(
            target=sync_generate_reel_script,
            args=(),
            kwargs={
                "paper_text": paper_text,
                "language": language,
                "paper_id": paper_id
            }
        )
        process.start()
        
        return {
            "status": "processing",
            "paper_id": paper_id,
            "message": "Script generation started for arXiv paper. Use paper_id to check status.",
            "source_type": "arxiv"
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[ARXIV_REEL ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error processing arXiv paper: {str(e)}"
        )


@router.post("/generate_reel_from_latex",
    summary="STEP 1: Generate Reel from LaTeX ZIP",
    tags=["Reel Generation - arXiv/LaTeX"],
    responses={
        200: {
            "description": "Script generation started successfully",
            "content": {
                "application/json": {
                    "example": {
                        "status": "processing",
                        "paper_id": "550e8400-e29b-41d4-a716-446655440000",
                        "message": "Script generation started. Use paper_id to check status."
                    }
                }
            }
        },
        400: {"description": "Invalid file format or missing file"},
        500: {"description": "Error processing LaTeX file"}
    }
)
async def generate_reel_from_latex(
    request: Request,
    file: UploadFile = File(..., description="ZIP file containing LaTeX source"),
    language: str = Form("english", description="Target language for dialogue"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a reel from a LaTeX ZIP file.
    
    **Workflow:**
    1. Extracts ZIP file
    2. Finds main .tex file
    3. Extracts text from LaTeX
    4. Generates dialogue script
    5. Returns paper_id for status tracking
    
    """
    try:
        if not file.filename.endswith('.zip'):
            raise HTTPException(
                status_code=400,
                detail="Only ZIP files are allowed"
            )
        
        paper_id = str(uuid.uuid4())
        temp_dir = f"temp/papers/{paper_id}"
        os.makedirs(temp_dir, exist_ok=True)
        
        print(f"[LATEX_REEL] Starting reel generation for LaTeX ZIP, paper_id: {paper_id}")
        
        # Save uploaded ZIP file
        zip_path = os.path.join(temp_dir, file.filename)
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Extract ZIP file
        extract_dir = os.path.join(temp_dir, "source")
        import zipfile
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Find main .tex file
        print(f"[LATEX_REEL] Finding main .tex file...")
        tex_file_path = find_tex_file(extract_dir)
        
        # Extract text from LaTeX file
        print(f"[LATEX_REEL] Extracting text from LaTeX file...")
        paper_text = extract_text_from_file(tex_file_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Insufficient text extracted from LaTeX file"
            )
        
        print(f"[LATEX_REEL] Extracted {len(paper_text)} characters from LaTeX")
        
        # Extract metadata from LaTeX file
        print(f"[LATEX_REEL] Extracting metadata from LaTeX file...")
        try:
            latex_metadata = extract_paper_metadata(tex_file_path)
            print(f"[LATEX_REEL] Metadata: {latex_metadata}")
        except Exception as e:
            print(f"[LATEX_REEL] Could not extract metadata: {e}")
            latex_metadata = {
                "title": file.filename.replace('.zip', '').replace('_', ' '),
                "authors": "Authors",
                "date": "2024"
            }
        
        # Extract user context for Firestore tracking
        user_ctx = get_user_context(request, current_user)
        
        # Initialize status with metadata (include user_id so background process can read it)
        update_job_status(
            paper_id=paper_id,
            status="processing",
            language=language,
            created_at=datetime.utcnow().isoformat(),
            source_type="latex",
            filename=file.filename,
            metadata=latex_metadata,
            stage="initializing",
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email')
        )
        
        # Track paper upload in Firestore so dashboard can find it
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='latex',
            filename=file.filename,
            title=latex_metadata.get('title')
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        # Start background process for script generation
        process = Process(
            target=sync_generate_reel_script,
            args=(),
            kwargs={
                "paper_text": paper_text,
                "language": language,
                "paper_id": paper_id
            }
        )
        process.start()
        
        return {
            "status": "processing",
            "paper_id": paper_id,
            "message": "Script generation started for LaTeX paper. Use paper_id to check status.",
            "source_type": "latex"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[LATEX_REEL ERROR] {str(e)}")
        traceback.print_exc()
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing LaTeX file: {str(e)}"
        )
