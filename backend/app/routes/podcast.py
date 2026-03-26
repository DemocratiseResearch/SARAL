from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.responses import FileResponse
import os
import fitz  # PyMuPDF for PDF text extraction
import re
import google.generativeai as genai
from sarvamai import SarvamAI
import tempfile
import uuid
import shutil
import zipfile
import traceback
from pathlib import Path
from app.auth.dependencies import get_current_user
import json
from app.services.podcast_service import extract_text_from_pdf, clean_text, generate_podcast_with_gemini, translate_dialogues_to_hindi
from app.services.podcast_service import translate_dialogues_to_tamil, get_audio_clips, combine_audio_clips, combine_with_ffmpeg, bhashini_translate_dialogues
from app.services.podcast_service import simple_binary_concat, cleanup_temp_files, get_audio_file_info, save_dialogue_to_file, extract_speakers_and_content
from app.services.script_generator import extract_text_from_file
from app.services.arxiv_scraper import ArxivScraper
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from app.utils.timing import track_performance
from app.services.metadata_tracker import track_paper_upload, track_output_generation
from app.middleware.session_tracking import get_user_context
from app.services.firestore_helpers import init_pipeline_tracking, update_pipeline_step, mark_pipeline_failed
from arq import create_pool as _arq_create_pool
from arq.connections import RedisSettings as _ArqRedisSettings
router = APIRouter()


from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
# Create a global thread pool
thread_pool = ThreadPoolExecutor(max_workers=4)


def _parse_podcast_to_segments(dialogue: str, language: str) -> list:
    """Parse podcast dialogue string into segment dicts for audio worker dispatch."""
    from app.services.voice_manager import voice_manager
    male_voice, female_voice = voice_manager.get_voice_pair()
    os.makedirs("gen", exist_ok=True)
    segments = []
    segment_count = 0
    for line in dialogue.split("\n"):
        line = line.strip()
        if not line:
            continue
        if ":" in line and (line.startswith("Aisha:") or line.startswith("Rohan:")):
            speaker_name = line.split(":")[0].strip()
            content = ":".join(line.split(":")[1:]).strip()
            if not content:
                continue
            voice = female_voice if speaker_name.lower() == "aisha" else male_voice
            segment_count += 1
            filename = f"segment_{segment_count:03d}_{speaker_name.lower()}.wav"
            output_path = os.path.join("gen", filename)
            segments.append({"text": content, "voice": voice, "output_path": output_path})
    return segments


# Status tracking helpers
@track_performance
def get_podcast_status_file_path(paper_id: str) -> str:
    """Get the path to the status file for a paper_id"""
    status_dir = "temp/podcast_status"
    os.makedirs(status_dir, exist_ok=True)
    return os.path.join(status_dir, f"{paper_id}.json")

@track_performance
def update_podcast_job_status(paper_id: str, status: str, **kwargs):
    """Update the status of a podcast job"""
    status_file = get_podcast_status_file_path(paper_id)
    
    data = {
        "paper_id": paper_id,
        "status": status,
        "updated_at": datetime.utcnow().isoformat(),
    }
    data.update(kwargs)
    
    with open(status_file, "w") as f:
        json.dump(data, f, indent=2)

@track_performance
def get_podcast_job_status(paper_id: str) -> dict:
    """Get the status of a podcast job"""
    status_file = get_podcast_status_file_path(paper_id)
    
    if not os.path.exists(status_file):
        return None
    
    with open(status_file, "r") as f:
        return json.load(f)


# Background worker function
@track_performance
def generate_podcast_background(temp_pdf_path: str = None, language: str = "english", paper_id: str = None, filename: str = "paper", paper_text: str = None, user_id: str = None):
    """Background function to generate podcast - supports both PDF and pre-extracted text"""
    _step_started_at = datetime.now()
    try:
        print(f"[THREAD] Starting podcast generation for paper_id = {paper_id}")
        try:
            update_pipeline_step(
                paper_id, "podcast_generation",
                metadata={"language": language},
                started_at=_step_started_at, status="in_progress"
            )
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        
        # Get API keys
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            update_podcast_job_status(
                paper_id=paper_id,
                status="failed",
                language=language,
                error_message="GEMINI_API_KEY environment variable not set",
                completed_at=datetime.utcnow().isoformat()
            )
            return
        
        sarvam_api_key = os.getenv("SARVAM_API_KEY")
        if not sarvam_api_key:
            update_podcast_job_status(
                paper_id=paper_id,
                status="failed",
                language=language,
                error_message="SARVAM_API_KEY environment variable not set",
                completed_at=datetime.utcnow().isoformat()
            )
            return

        # Create event loop for async operations
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Extract text from PDF or use provided text
            if paper_text:
                print(f"[THREAD] Using pre-extracted text (length: {len(paper_text)})")
            else:
                update_podcast_job_status(
                    paper_id=paper_id,
                    status="processing",
                    language=language,
                    stage="extracting text"
                )
                
                print(f"[THREAD] Extracting text from PDF: {filename}")
                paper_text = extract_text_from_pdf(temp_pdf_path)
            
            if not paper_text or len(paper_text.strip()) < 100:
                update_podcast_job_status(
                    paper_id=paper_id,
                    status="failed",
                    language=language,
                    error_message="Insufficient text extracted from PDF",
                    completed_at=datetime.utcnow().isoformat()
                )
                return
            
            # Clean the extracted text
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="cleaning text"
            )
            
            paper_text = loop.run_until_complete(clean_text(paper_text))
            
            # Generate podcast dialogue
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="generating dialogue"
            )
            
            print("[THREAD] Generating podcast dialogue with Gemini...")
            _script_start = datetime.now()
            try:
                update_pipeline_step(paper_id, "podcast_script_generation",
                    metadata={"language": language}, started_at=_script_start, status="in_progress")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            try:
                podcast_dialogue = loop.run_until_complete(
                    generate_podcast_with_gemini(gemini_api_key, paper_text)
                )
            except Exception as _e:
                try:
                    mark_pipeline_failed(paper_id, "podcast_script_generation", _e, started_at=_script_start)
                except Exception as _pe:
                    print(f"[WARNING] Pipeline tracking error: {_pe}")
                raise
            try:
                update_pipeline_step(paper_id, "podcast_script_generation",
                    metadata={"language": language}, started_at=_script_start, status="completed")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            
            if language.lower() != "english":
                update_podcast_job_status(
                    paper_id=paper_id,
                    status="processing",
                    language=language,
                    stage="translating"
                )
                
                print(f"[THREAD] Translating dialogue to {language} using Sarvam AI...")
                podcast_dialogue = loop.run_until_complete(
                    bhashini_translate_dialogues(podcast_dialogue,"English",language)
                )
                print(f"Dialogue:{podcast_dialogue}")
        
            
            # Save dialogue to file
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="saving dialogue"
            )
            
            paper_name = os.path.splitext(filename)[0]
            saved_file_path = loop.run_until_complete(
                save_dialogue_to_file(podcast_dialogue, paper_name)
            )
            
            # Analyze dialogue content
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="analyzing_dialogue"
            )
            
            dialogue_analysis = loop.run_until_complete(
                extract_speakers_and_content(podcast_dialogue)
            )
            
            # Generate audio clips
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="generating audio"
            )
            
            print("[THREAD] Generating audio clips...")
            _audio_start = datetime.now()
            try:
                update_pipeline_step(paper_id, "podcast_audio_generation",
                    metadata={"language": language}, started_at=_audio_start, status="in_progress")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            try:
                _podcast_segments = _parse_podcast_to_segments(podcast_dialogue, language)
                print(f"[THREAD] Dispatching {len(_podcast_segments)} segments to audio worker")
                _audio_pool = loop.run_until_complete(
                    _arq_create_pool(_ArqRedisSettings(host='localhost', port=6379, database=0))
                )
                _audio_job = loop.run_until_complete(
                    _audio_pool.enqueue_job(
                        'generate_dialogue_audio_task',
                        paper_id,
                        sarvam_api_key,
                        language,
                        _podcast_segments,
                        "gen",
                        "podcast_audio_generation",
                        "AUDIO_WORKER_PODCAST",
                        _queue_name='audio_generation_queue',
                    )
                )
                _audio_result = loop.run_until_complete(_audio_job.result(timeout=600, poll_delay=1.0))
                loop.run_until_complete(_audio_pool.close())
                audio_files = [{"file_path": p} for p in _audio_result.get("audio_files", [])]
            except Exception as _e:
                try:
                    mark_pipeline_failed(paper_id, "podcast_audio_generation", _e, started_at=_audio_start)
                except Exception as _pe:
                    print(f"[WARNING] Pipeline tracking error: {_pe}")
                raise
            try:
                update_pipeline_step(paper_id, "podcast_audio_generation",
                    metadata={"language": language, "audio_segments": len(audio_files)},
                    started_at=_audio_start, status="completed")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            
            # Combine audio clips
            update_podcast_job_status(
                paper_id=paper_id,
                status="processing",
                language=language,
                stage="combining audio"
            )
            
            print("[THREAD] Combining audio clips...")
            _combine_start = datetime.now()
            try:
                update_pipeline_step(paper_id, "podcast_audio_combining",
                    metadata={"language": language, "segments_to_combine": len(audio_files)},
                    started_at=_combine_start, status="in_progress")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            try:
                combined_audio_path = loop.run_until_complete(
                    combine_audio_clips(audio_files, paper_id)
                )
            except Exception as _e:
                try:
                    mark_pipeline_failed(paper_id, "podcast_audio_combining", _e, started_at=_combine_start)
                except Exception as _pe:
                    print(f"[WARNING] Pipeline tracking error: {_pe}")
                raise
            try:
                update_pipeline_step(paper_id, "podcast_audio_combining",
                    metadata={"language": language, "segments_combined": len(audio_files)},
                    started_at=_combine_start, status="completed")
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            
            # Get audio file info
            audio_info = loop.run_until_complete(
                get_audio_file_info(combined_audio_path)
            )
            
            # Track output generation (no user context available in background thread)
            try:
                track_output_generation(
                    paper_id=paper_id,
                    output_type='podcast',
                    file_path=str(combined_audio_path),
                    duration=audio_info.get('duration_seconds') if audio_info else None,
                    user_id=user_id
                )
            except Exception as e:
                print(f"[WARNING] Failed to track output generation: {e}")
            
            
            # Update status to completed
            update_podcast_job_status(
                paper_id=paper_id,
                status="completed",
                language=language,
                stage="done",
                paper_text_length=len(paper_text),
                dialogue_length=len(podcast_dialogue),
                dialogue=podcast_dialogue,
                saved_file=str(saved_file_path),  # Convert to string
                analysis=dialogue_analysis,
                total_audio_segments=len(audio_files),
                combined_audio_path=str(combined_audio_path),  # Convert to string
                audio_filename=os.path.basename(combined_audio_path),
                audio_info=audio_info,
                completed_at=datetime.utcnow().isoformat()
            )
            
            print(f"[THREAD] Podcast generation completed for {paper_id}")
            try:
                update_pipeline_step(
                    paper_id, "podcast_generation",
                    metadata={
                        "language": language,
                        "audio_filename": os.path.basename(combined_audio_path),
                        "audio_segments": len(audio_files),
                    },
                    started_at=_step_started_at, status="completed"
                )
            except Exception as _pe:
                print(f"[WARNING] Pipeline tracking error: {_pe}")
            
        finally:
            loop.close()
            
            # Clean up temporary PDF file
            try:
                if os.path.exists(temp_pdf_path):
                    os.unlink(temp_pdf_path)
                    print(f"[THREAD] Cleaned up temporary file: {temp_pdf_path}")
            except Exception as e:
                print(f"[THREAD] Warning: Could not delete temporary file {temp_pdf_path}: {str(e)}")
                
    except Exception as e:
        print(f"[THREAD ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        
        try:
            mark_pipeline_failed(paper_id, "podcast_generation", e, started_at=_step_started_at)
        except Exception as _pe:
            print(f"[WARNING] Pipeline tracking error: {_pe}")
        
        update_podcast_job_status(
            paper_id=paper_id,
            status="failed",
            language=language,
            error_message=str(e),
            completed_at=datetime.utcnow().isoformat()
        )
        
        # Clean up on error
        try:
            if os.path.exists(temp_pdf_path):
                os.unlink(temp_pdf_path)
        except:
            pass


@router.post("/get_podcast")
async def get_podcast(request: Request, file: UploadFile = File(...), language: str = Form("english"), current_user: dict = Depends(get_current_user)):
    """Generate a podcast dialogue from an uploaded PDF using Gemini AI and create audio clips."""
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Validate language selection
    if language.lower() not in ["english", "hindi", "tamil"]:
        raise HTTPException(status_code=400, detail="Language must be 'english', 'hindi', or 'tamil'")
    
    print(f"Generating podcast in {language} language...")
    paper_id = str(uuid.uuid4())
    
    # Create temp directory
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    # Save uploaded file
    try:
        temp_pdf_path = os.path.join(temp_dir, file.filename)
        with open(temp_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving uploaded file: {str(e)}")
    
    # Initialize status
    update_podcast_job_status(
        paper_id=paper_id,
        status="processing",
        language=language,
        created_at=datetime.utcnow().isoformat(),
        filename=file.filename,
        stage="initializing"
    )
    
    # Extract user context for tracking
    user_ctx = get_user_context(request, current_user)
    
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
    
    # Submit to thread pool for background processing
    thread_pool.submit(
        generate_podcast_background,
        temp_pdf_path,
        language,
        paper_id,
        file.filename,
        None,  # paper_text
        user_ctx.get('user_id')  # user_id for Firestore tracking
    )
    
    return {
        "success": True,
        "status": "processing",
        "paper_id": paper_id,
        "uploaded_file": file.filename,
        "language": language,
        "message": f"Podcast generation started in {language}. Use paper_id to check status."
    }


@router.get("/podcast_status/{paper_id}")
async def get_podcast_status(paper_id: str):
    """Check the status of podcast generation"""
    status = get_podcast_job_status(paper_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Podcast job not found")
    
    response = {
        "paper_id": status.get("paper_id"),
        "status": status.get("status"),
        "language": status.get("language"),
        "stage": status.get("stage"),
        "created_at": status.get("created_at"),
        "updated_at": status.get("updated_at"),
    }
    
    if status.get("status") == "completed":
        response["completed_at"] = status.get("completed_at")
        response["paper_text_length"] = status.get("paper_text_length")
        response["dialogue_length"] = status.get("dialogue_length")
        response["dialogue"] = status.get("dialogue")
        response["saved_file"] = status.get("saved_file")
        response["analysis"] = status.get("analysis")
        response["total_audio_segments"] = status.get("total_audio_segments")
        response["combined_audio_path"] = status.get("combined_audio_path")
        response["audio_filename"] = status.get("audio_filename")
        response["audio_info"] = status.get("audio_info")
        response["download_url"] = f"/download_podcast/{paper_id}"
    
    if status.get("status") == "failed":
        response["error_message"] = status.get("error_message")
    
    return response





@router.get("/download_audio/{paper_id}")
async def download_podcast_audio(paper_id: str):
    """Download generated podcast audio file."""
    try:
        output_filename = "podcast_full.wav"
        # file_path = os.path.join("gen", filename)
        output_dir = Path(f"temp/podcast/{paper_id}")
        os.makedirs(output_dir, exist_ok=True)
        file_path = output_dir / output_filename
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        return FileResponse(
            path=file_path,
            media_type="audio/wav",
            filename=output_filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving audio file: {str(e)}")

@router.get("/stream_audio/{paper_id}")
async def stream_podcast_audio(paper_id: str):
    """Stream generated podcast audio file."""
    try:
        
        output_filename = "podcast_full.wav"
        # file_path = os.path.join("gen", filename)
        output_dir = Path(f"temp/podcast/{paper_id}")
        os.makedirs(output_dir, exist_ok=True)
        file_path = output_dir / output_filename

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


@router.post("/get_podcast_from_arxiv")
async def get_podcast_from_arxiv(
    request: Request,
    arxiv_url: str = Form(..., description="arXiv URL (e.g., https://arxiv.org/abs/2401.12345)"),
    language: str = Form("english", description="Target language (english, hindi, tamil, etc.)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a podcast from an arXiv paper URL.
    
    **Workflow:**
    1. Downloads arXiv source files
    2. Extracts text from LaTeX files
    3. Generates podcast dialogue with Gemini AI
    4. Translates to target language (if not English)
    5. Generates audio clips with TTS
    6. Combines audio into final podcast
    7. Returns paper_id for status tracking
    
    """
    try:
        # Validate language
        valid_languages = ["english", "hindi", "tamil", "bengali", "gujarati", "kannada", "malayalam", "marathi", "odia", "punjabi", "telugu"]
        if language.lower() not in valid_languages:
            raise HTTPException(
                status_code=400,
                detail=f"Language must be one of: {', '.join(valid_languages)}"
            )
        
        print(f"[ARXIV_PODCAST] Starting podcast generation for arXiv URL: {arxiv_url}, language: {language}")
        paper_id = str(uuid.uuid4())
        
        # Initialize scraper
        scraper = ArxivScraper()
        
        # Download and extract arXiv source
        print(f"[ARXIV_PODCAST] Downloading arXiv source...")
        extracted_dir = scraper.download_source(arxiv_url)
        
        # Find main .tex file
        print(f"[ARXIV_PODCAST] Finding main .tex file...")
        tex_file_path = find_tex_file(extracted_dir)
        
        # Extract text from LaTeX file
        print(f"[ARXIV_PODCAST] Extracting text from LaTeX file...")
        paper_text = extract_text_from_file(tex_file_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Insufficient text extracted from arXiv paper"
            )
        
        print(f"[ARXIV_PODCAST] Extracted {len(paper_text)} characters from LaTeX")
        
        # Initialize status
        update_podcast_job_status(
            paper_id=paper_id,
            status="processing",
            language=language,
            created_at=datetime.utcnow().isoformat(),
            source_type="arxiv",
            arxiv_url=arxiv_url,
            stage="initializing"
        )
        
        # Extract user context for tracking
        user_ctx = get_user_context(request, current_user)
        
        # Track paper upload in Firestore so dashboard can find it
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='arxiv',
            filename=arxiv_url
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        # Submit to thread pool for background processing
        thread_pool.submit(
            generate_podcast_background,
            None,  # temp_pdf_path
            language,
            paper_id,
            f"arxiv_{scraper.extract_arxiv_id(arxiv_url)}",  # filename
            paper_text,  # pre-extracted text
            user_ctx.get('user_id')  # user_id for Firestore tracking
        )
        
        return {
            "paper_id": paper_id,
            "status": "processing",
            "message": f"Podcast generation started for arXiv paper in {language}. Use paper_id to check status.",
            "source_type": "arxiv",
            "language": language
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[ARXIV_PODCAST ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error processing arXiv paper: {str(e)}"
        )


@router.post("/get_podcast_from_latex")
async def get_podcast_from_latex(
    request: Request,
    file: UploadFile = File(..., description="ZIP file containing LaTeX source"),
    language: str = Form("english", description="Target language (english, hindi, tamil, etc.)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a podcast from a LaTeX ZIP file.
    
    **Workflow:**
    1. Extracts ZIP file
    2. Finds main .tex file
    3. Extracts text from LaTeX
    4. Generates podcast dialogue with Gemini AI
    5. Translates to target language (if not English)
    6. Generates audio clips with TTS
    7. Combines audio into final podcast
    8. Returns paper_id for status tracking

    """
    try:
        # Validate file type
        if not file.filename.endswith('.zip'):
            raise HTTPException(
                status_code=400,
                detail="Only ZIP files are allowed"
            )
        
        # Validate language
        valid_languages = ["english", "hindi", "tamil", "bengali", "gujarati", "kannada", "malayalam", "marathi", "odia", "punjabi", "telugu"]
        if language.lower() not in valid_languages:
            raise HTTPException(
                status_code=400,
                detail=f"Language must be one of: {', '.join(valid_languages)}"
            )
        
        print(f"[LATEX_PODCAST] Starting podcast generation for LaTeX ZIP, language: {language}")
        paper_id = str(uuid.uuid4())
        temp_dir = f"temp/papers/{paper_id}"
        os.makedirs(temp_dir, exist_ok=True)
        
        # Save uploaded ZIP file
        zip_path = os.path.join(temp_dir, file.filename)
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Extract ZIP file
        extract_dir = os.path.join(temp_dir, "source")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Find main .tex file
        print(f"[LATEX_PODCAST] Finding main .tex file...")
        tex_file_path = find_tex_file(extract_dir)
        
        # Extract text from LaTeX file
        print(f"[LATEX_PODCAST] Extracting text from LaTeX file...")
        paper_text = extract_text_from_file(tex_file_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail="Insufficient text extracted from LaTeX file"
            )
        
        print(f"[LATEX_PODCAST] Extracted {len(paper_text)} characters from LaTeX")
        
        # Initialize status
        update_podcast_job_status(
            paper_id=paper_id,
            status="processing",
            language=language,
            created_at=datetime.utcnow().isoformat(),
            source_type="latex",
            filename=file.filename,
            stage="initializing"
        )
        
        # Extract user context for tracking
        user_ctx = get_user_context(request, current_user)
        
        # Track paper upload in Firestore so dashboard can find it
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='latex',
            filename=file.filename
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        # Submit to thread pool for background processing
        thread_pool.submit(
            generate_podcast_background,
            None,  # temp_pdf_path
            language,
            paper_id,
            os.path.splitext(file.filename)[0],  # filename without extension
            paper_text,  # pre-extracted text
            user_ctx.get('user_id')  # user_id for Firestore tracking
        )
        
        return {
            "paper_id": paper_id,
            "status": "processing",
            "message": f"Podcast generation started for LaTeX paper in {language}. Use paper_id to check status.",
            "source_type": "latex",
            "language": language
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[LATEX_PODCAST ERROR] {str(e)}")
        traceback.print_exc()
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing LaTeX file: {str(e)}"
        )