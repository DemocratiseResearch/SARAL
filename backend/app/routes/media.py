from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
import os
from pathlib import Path
import json
import traceback
import logging
from app.auth.dependencies import get_current_user
from app.models.request_models import AudioGenerationRequest, VideoGenerationRequest, MediaResponse
from app.routes.papers import papers_storage
from app.routes.scripts import scripts_storage
from app.routes.slides import slides_storage
from app.routes.api_keys import get_api_keys
from app.services.tts_service import ensure_audio_is_generated, ensure_hindi_audio_is_generated, ensure_language_audio_is_generated
from app.services.tts_service import ensure_audio_is_generated_bhashini, bhashini_mt
# NOTE: video_service.create_video_with_audio is now called by video_generation_worker
from app.services.hindi_service import generate_hindi_script_with_google
from app.services.language_service import translate_to_language
from app.services.script_to_video import mt_bhashini_title, mt_bhashini_sections, tts_bhashini_title
from app.services.sarvam_sdk import SarvamTTS
from app.services.generate_twitter_thread import generate_twitter_thread

import google.generativeai as genai
from typing import Dict, Optional
from app.services.linkedin_caption_service import (
    generate_linkedin_caption_with_gemini,
    generate_short_linkedin_caption,
    generate_linkedin_caption_points
)
from app.services.script_generator import extract_text_from_file
from app.services.storage_manager import storage_manager
from app.routes.api_keys import get_api_keys
from app.workers.pool import get_worker_pool
from app.utils.timing import track_performance
from app.services.metadata_tracker import track_output_generation
from app.middleware.session_tracking import get_user_context
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory storage for media
media_storage = {}

# In-memory storage for generated twitter threads
threads_storage = {}

# ==========================
# Universal Paper Helpers
# ==========================

def get_paper_text(paper_id: str):

    # 1️⃣ PDF extracted text
    text_path = os.path.join("temp", "papers", paper_id, "source", "extracted_text.txt")

    if os.path.exists(text_path):
        with open(text_path, "r", encoding="utf-8") as f:
            return f.read()

    # 2️⃣ fallback for arxiv / latex
    if paper_id in scripts_storage:

        scripts = scripts_storage[paper_id]

        title_intro = scripts.get("title_intro_script", "")

        section_texts = []
        for section_name, section_data in scripts.get("sections", {}).items():

            if isinstance(section_data, dict):
                section_texts.append(section_data.get("script", ""))

            else:
                section_texts.append(str(section_data))

        return title_intro + "\n\n" + "\n\n".join(section_texts)

    return None


def get_images_folder(paper_id: str):

    # 1️⃣ PDF images (normal upload)
    pdf_images = os.path.join("temp", "papers", paper_id, "source", "images")

    if os.path.exists(pdf_images):
        return pdf_images


    # 2️⃣ arXiv images
    arxiv_root = os.path.join("temp", "arxiv_sources")

    if os.path.exists(arxiv_root):

        for folder in os.listdir(arxiv_root):

            source = os.path.join(arxiv_root, folder, "source")

            if os.path.exists(source):

                image_files = [
                    f for f in os.listdir(source)
                    if f.lower().endswith((".png", ".jpg", ".jpeg"))
                ]

                if image_files:
                    return source


    # 3️⃣ LaTeX upload images
    latex_root = os.path.join("temp", "papers", paper_id, "source")

    if os.path.exists(latex_root):
        for root, dirs, files in os.walk(latex_root):

            # remove macOS metadata folders
            dirs[:] = [d for d in dirs if d != "__MACOSX"]

            image_files = [
                f for f in files
                if f.lower().endswith((".png", ".jpg", ".jpeg"))
            ]

            if image_files:
                return root

    return None

def get_latex_images(paper_id: str):

    latex_root = os.path.join("temp", "papers", paper_id, "source")

    image_paths = []

    if os.path.exists(latex_root):

        for root, dirs, files in os.walk(latex_root):

            # 🚫 Remove macOS metadata folders before traversal
            dirs[:] = [d for d in dirs if d != "__MACOSX"]

            for file in files:

                # 🚫 Ignore macOS metadata files
                if file.startswith("."):
                    continue

                if file.lower().endswith((".png", ".jpg", ".jpeg")):

                    full_path = os.path.join(root, file)

                    relative_path = os.path.relpath(full_path, latex_root)

                    image_paths.append(relative_path)

    return image_paths
# NOTE: Semaphore removed - concurrency now controlled by video_generation_worker (max_jobs=2)
# The worker ensures only 2 video generations run concurrently across all requests


@track_performance
async def enqueue_video_generation_job(
    pool, 
    paper_id: str, 
    slide_images: list, 
    audio_files: list, 
    background_music_file: Optional[str], 
    output_file: str, 
    selected_language: str
):
    """Enqueue video generation to dedicated worker."""
    logger.info(f"[{paper_id[:8]}] Enqueuing video generation job")
    return await pool.enqueue_job(
        'generate_video_task',
        paper_id,
        slide_images,
        audio_files,
        background_music_file,
        output_file,
        selected_language,
        _queue_name='video_generation_queue'
    )


@track_performance
async def wait_for_video_generation_result(job, paper_id: str):
    """Wait for video generation worker to complete."""
    logger.info(f"[{paper_id[:8]}] Waiting for video generation to complete...")
    result = await job.result(timeout=600, poll_delay=2.0)  # 10 minutes timeout
    return result

@router.post("/{paper_id}/generate-audio", response_model=MediaResponse)
async def generate_audio(
    paper_id: str,
    request: AudioGenerationRequest,
    api_keys: dict = Depends(get_api_keys)
):
    
    print(f"Generating audio for paper ID: {paper_id}")
    paper_info = papers_storage[paper_id]
    print("paper_info", paper_info)
    paper_language = paper_info.get("language", "English")
    print("paper_language", paper_language)

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

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        update_pipeline_step(
            paper_id, "audio_generation",
            metadata={"language": paper_info.get("language", "English")},
            started_at=_step_started_at, status="in_progress"
        )
        scripts_info = scripts_storage[paper_id]
        paper_info = papers_storage.get(paper_id, {})
        source_type = paper_info.get("source_type", "paper")  # Default to paper

        # Define the correct section order based on the document type
        if source_type == "patent":
            section_order = ["Potential Applications","Introduction", "Background", "Invention Description", "Claims and applications", "Conclusion"]
        else:  # Default for paper, latex, pdf
            section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]

        audio_dir = f"temp/audio/{paper_id}"
        Path(audio_dir).mkdir(parents=True, exist_ok=True)

        sections_scripts = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if isinstance(section_data, dict):
                sections_scripts[section_name] = section_data.get("script", "")
            else:
                sections_scripts[section_name] = str(section_data)

        if paper_language == "Hindi":
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
        elif paper_language == "English":
            title_intro_script = scripts_info.get("title_intro_script", "")
            language = "English"
        elif paper_language in ["Urdu", "Santali", "Sanskrit", "Assamese", "Manipuri", "Bodo", "Dogri", "Maithili"]:
            print(f"Title intro script: {scripts_info.get('title_intro_script', '')}")
            eng_title_intro_script = scripts_info.get("title_intro_script", "")
            # scripts = [script for name, script in sections_scripts.items()]
            # scripts = list(sections_scripts.values())
            scripts = sections_scripts
            # print("scripts", scripts)
            language = paper_language
            # language = "Urdu"
            title_intro_script = await mt_bhashini_title(eng_title_intro_script, language)
            sections_scripts = await mt_bhashini_sections(scripts, language)
            print("title_intro_script", title_intro_script)
            print("sections_scripts", sections_scripts)
            # title_intro_script = scripts_info.get("title_intro_script", "")
            # title_intro_script = await script_to_video.generate_bhashini_audio(paper_id, api_keys, "English", "male")
        else:
            print(f"Translating to {paper_language}")
            title_intro_script = translate_to_language(
                scripts_info.get("title_intro_script", ""),
                paper_language,
                api_keys.get("sarvam_key")
            )
            sections_scripts = {
                name: translate_to_language(script, paper_language, api_keys.get("sarvam_key"))
                for name, script in sections_scripts.items()
            }
            language = paper_language
        print(f"Title intro script: {title_intro_script}")

        #  Filter scripts to only include those in the defined order
        ordered_scripts = {name: sections_scripts[name] for name in section_order if name in sections_scripts}
        if language == "Hindi":
            _sarvam_key = api_keys.get("sarvam_key")
            _tts_check = SarvamTTS(api_key=_sarvam_key)
            if not _tts_check.test_connection():
                raise HTTPException(status_code=503, detail="Sarvam TTS service unavailable")
            logger.info(f"[{paper_id[:8]}] Sarvam TTS verified, dispatching Hindi audio to worker")
            _pool = await get_worker_pool()
            _audio_job = await _pool.enqueue_job(
                'generate_paper_audio_task',
                paper_id, _sarvam_key, language, request.voice_selection, section_order,
                title_intro_script, sections_scripts,
                request.hinglish_iterations, api_keys.get("openai_key"), request.show_hindi_debug,
                "AUDIO_WORKER_MEDIA",
                _queue_name='audio_generation_queue',
            )
            _audio_result = await _audio_job.result(timeout=600, poll_delay=2.0)
            audio_response = {"audio_files": _audio_result["audio_files"]}
        elif language == "English":
            _sarvam_key = api_keys.get("sarvam_key")
            _tts_check = SarvamTTS(api_key=_sarvam_key)
            if not _tts_check.test_connection():
                raise HTTPException(status_code=503, detail="Sarvam TTS service unavailable")
            logger.info(f"[{paper_id[:8]}] Sarvam TTS verified, dispatching English audio to worker")
            _pool = await get_worker_pool()
            _audio_job = await _pool.enqueue_job(
                'generate_paper_audio_task',
                paper_id, _sarvam_key, language, request.voice_selection, section_order,
                title_intro_script, sections_scripts,
                request.hinglish_iterations, api_keys.get("openai_key"), request.show_hindi_debug,
                "AUDIO_WORKER_MEDIA",
                _queue_name='audio_generation_queue',
            )
            _audio_result = await _audio_job.result(timeout=600, poll_delay=2.0)
            audio_response = {"audio_files": _audio_result["audio_files"]}
        elif language in ["Urdu", "Santali", "Sanskrit", "Assamese", "Manipuri", "Bodo", "Dogri", "Maithili"]:
            print(f"using voice selection:, {request.voice_selection}")
            print("for language", language)
            if language == "Urdu":
                gender = "male"
            else:
                gender = "female"
            gender_type = request.voice_selection.get(language, "")
            print("gender_type", gender_type)
            # if gender_type == "vidya":
            #     gender = "female"
            # else:
            #     gender = "male"
            audio_response = await tts_bhashini_title(title_intro_script, sections_scripts, language, gender, paper_id, section_order)
        else:
            _sarvam_key = api_keys.get("sarvam_key")
            _tts_check = SarvamTTS(api_key=_sarvam_key)
            if not _tts_check.test_connection():
                raise HTTPException(status_code=503, detail="Sarvam TTS service unavailable")
            logger.info(f"[{paper_id[:8]}] Sarvam TTS verified, dispatching {language} audio to worker")
            _pool = await get_worker_pool()
            _audio_job = await _pool.enqueue_job(
                'generate_paper_audio_task',
                paper_id, _sarvam_key, language, request.voice_selection, section_order,
                title_intro_script, sections_scripts,
                request.hinglish_iterations, api_keys.get("openai_key"), False,
                "AUDIO_WORKER_MEDIA",
                _queue_name='audio_generation_queue',
            )
            _audio_result = await _audio_job.result(timeout=600, poll_delay=2.0)
            audio_response = {"audio_files": _audio_result["audio_files"]}

        audio_files = audio_response["audio_files"]
        if paper_id not in media_storage:
            media_storage[paper_id] = {}

        media_storage[paper_id]["audio_files"] = [os.path.join(audio_dir, f) for f in audio_files]
        media_storage[paper_id]["audio_dir"] = audio_dir

        update_pipeline_step(
            paper_id, "audio_generation",
            metadata={
                "language": language,
                "audio_files_count": len(audio_files),
                "audio_dir": audio_dir,
            },
            started_at=_step_started_at, status="completed"
        )

        return MediaResponse(
            audio_files=audio_files,
            paper_id=paper_id
        )

    except Exception as e:
        mark_pipeline_failed(paper_id, "audio_generation", e, started_at=_step_started_at)
        print(f"Error generating audio: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")

@router.get("/{paper_id}/stream-audio/{filename}")
async def stream_audio(paper_id: str, filename: str, request: Request):
    if paper_id not in media_storage:
        raise HTTPException(status_code=404, detail="Media not found")

    audio_dir = media_storage[paper_id].get("audio_dir")
    if not audio_dir:
        raise HTTPException(status_code=404, detail="Audio directory not found")

    audio_path = os.path.join(audio_dir, filename)
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_size = os.path.getsize(audio_path)
    range_header = request.headers.get("range")
    if range_header:
        start, end = range_header.replace("bytes=", "").split("-")
        start = int(start)
        end = int(end) if end else file_size - 1
        chunk_size = end - start + 1

        def iterfile():
            with open(audio_path, "rb") as f:
                f.seek(start)
                yield f.read(chunk_size)

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type="audio/wav",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
            },
        )
    else:
        return StreamingResponse(
            open(audio_path, "rb"),
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )


@router.post("/{paper_id}/generate-video", response_model=MediaResponse)
async def generate_video(
    paper_id: str,
    request: VideoGenerationRequest,
    background_tasks: BackgroundTasks,
    fastapi_request: Request = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate final video from slides and audio using dedicated worker.
    
    This endpoint now enqueues video generation to a dedicated worker pool
    instead of running MoviePy directly, preventing resource exhaustion.
    
    Worker Architecture:
    - Queue: video_generation_queue
    - Max concurrent jobs: 2 (controlled by worker, not semaphore)
    - Timeout: 10 minutes
    """
    logger.info(f"[{paper_id[:8]}] Video generation endpoint called")
    
    # Validate prerequisites
    paper_info = papers_storage[paper_id]
    # print("paper_info", paper_info)
    paper_language = paper_info.get("language", "English")
    print("paper_language", paper_language)
    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not found")
    
    if paper_id not in media_storage or "audio_files" not in media_storage[paper_id]:
        raise HTTPException(status_code=404, detail="Audio files not found")
    
    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        update_pipeline_step(
            paper_id, "video_generation",
            metadata={"language": paper_language},
            started_at=_step_started_at, status="in_progress"
        )
        slides_info = slides_storage[paper_id]
        media_info = media_storage[paper_id]
        
        # Create video directory
        video_dir = f"temp/videos/{paper_id}"
        Path(video_dir).mkdir(parents=True, exist_ok=True)
        
        # Get slide images and audio files
        slide_images = slides_info["image_paths"]
        audio_files = media_info["audio_files"]
        
        logger.info(f"[{paper_id[:8]}] Creating video with {len(slide_images)} slides and {len(audio_files)} audio files")
        
        # Prepare output file
        output_file = os.path.join(video_dir, f"final_video_{paper_language.lower()}.mp4")
        
        # Enqueue job to video generation worker (tracked)
        pool = await get_worker_pool()
        job = await enqueue_video_generation_job(
            pool=pool,
            paper_id=paper_id,
            slide_images=slide_images,
            audio_files=audio_files,
            background_music_file=request.background_music_file,
            output_file=output_file,
            selected_language=paper_language
        )
        
        # Wait for job to complete (tracked)
        result = await wait_for_video_generation_result(job, paper_id)
        
        if not result or result.get('status') != 'success':
            raise HTTPException(status_code=500, detail="Video generation job failed")
        
        # Extract result data
        video_path_basename = result.get('video_path')
        
        # Store full video path in media_storage
        full_video_path = os.path.join(video_dir, video_path_basename)
        media_storage[paper_id]["video_path"] = full_video_path
        
        # Track output generation
        if fastapi_request:
            user_ctx = get_user_context(fastapi_request, current_user)
            track_output_generation(
                paper_id=paper_id,
                output_type='video',
                file_path=full_video_path,
                user_id=user_ctx.get('user_id')
            )
            
        
        logger.info(f"[{paper_id[:8]}] Video generation completed successfully")
        
        update_pipeline_step(
            paper_id, "video_generation",
            metadata={
                "language": paper_language,
                "video_path": video_path_basename,
                "slides_count": len(slide_images),
            },
            started_at=_step_started_at, status="completed"
        )

        # Generate LinkedIn caption after video is complete
        caption = None
        try:
            logger.info(f"[{paper_id[:8]}] Generating LinkedIn caption")
            paper_id_str = str(paper_id)

            # Get paper info from storage
            paper_info = storage_manager.get_paper(paper_id_str)
            if not paper_info:
                # Fallback to in-memory storage
                if paper_id_str in papers_storage:
                    paper_info = papers_storage[paper_id_str]
                else:
                    logger.warning(f"[{paper_id[:8]}] Paper not found for caption generation")
                    paper_info = None

            if paper_info:
                gemini_key = os.getenv("GEMINI_API_KEY")
                
                if gemini_key:
                    # Get text file path
                    paper_text = get_paper_text(paper_id_str)

                    if paper_text and len(paper_text.strip()) >= 100:
                        # Get metadata
                        metadata = paper_info.get("metadata", {})

                        caption = generate_linkedin_caption_points(
                            api_key=gemini_key,
                            paper_metadata=metadata,
                            paper_text=paper_text
                        )
                            
                        logger.info(f"[{paper_id[:8]}] Successfully generated LinkedIn caption")
                    else:
                        logger.warning(f"[{paper_id[:8]}] Insufficient paper content for caption generation")
                else:
                    logger.warning(f"[{paper_id[:8]}] Text file not found for caption generation")
            else:
                logger.warning(f"[{paper_id[:8]}] GEMINI_API_KEY not found, skipping caption generation")
                    
        except Exception as e:
            logger.error(f"[{paper_id[:8]}] Error generating LinkedIn caption: {str(e)}")
            logger.error(traceback.format_exc())
            # Don't fail the entire request if caption generation fails
            caption = None
        
        # Return response matching original structure
        return MediaResponse(
            audio_files=[os.path.basename(f) for f in audio_files],
            video_path=video_path_basename,
            caption=caption,
            paper_id=paper_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        mark_pipeline_failed(paper_id, "video_generation", e, started_at=_step_started_at)
        logger.error(f"[{paper_id[:8]}] Error in video generation endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating video: {str(e)}")
    



# @router.post("/{paper_id}/generate-video", response_model=MediaResponse)
# async def generate_video(
#     paper_id: str,
#     request: VideoGenerationRequest,
#     background_tasks: BackgroundTasks
# ):
#     """Generate final video from slides and audio."""
    
#     if paper_id not in slides_storage:
#         raise HTTPException(status_code=404, detail="Slides not found")
    
#     if paper_id not in media_storage or "audio_files" not in media_storage[paper_id]:
#         raise HTTPException(status_code=404, detail="Audio files not found")
    
#     try:
#         slides_info = slides_storage[paper_id]
#         media_info = media_storage[paper_id]
        
#         # Create video directory
#         video_dir = f"temp/videos/{paper_id}"
#         Path(video_dir).mkdir(parents=True, exist_ok=True)
        
#         # Get slide images and audio files
#         slide_images = slides_info["image_paths"]
#         audio_files = media_info["audio_files"]
        
#         print(f"Creating video with {len(slide_images)} slides and {len(audio_files)} audio files")
        
#         # Generate video
#         output_file = os.path.join(video_dir, f"final_video_{request.selected_language.lower()}.mp4")
        
#         video_path = create_video_with_audio(
#             slide_images=slide_images,
#             audio_files=audio_files,
#             background_music_file=request.background_music_file,
#             output_file=output_file
#         )
        
#         media_storage[paper_id]["video_path"] = video_path
        
#         return MediaResponse(
#             audio_files=[os.path.basename(f) for f in audio_files],
#             video_path=os.path.basename(video_path) if video_path else None,
#             paper_id=paper_id
#         )
        
#     except Exception as e:
#         print(f"Error generating video: {str(e)}")
#         print(traceback.format_exc())
#         raise HTTPException(status_code=500, detail=f"Error generating video: {str(e)}")

@router.get("/{paper_id}/download-video")
async def download_video(paper_id: str):
    """Download the generated video."""
    
    if paper_id not in media_storage or "video_path" not in media_storage[paper_id]:
        raise HTTPException(status_code=404, detail="Video not found")
    
    video_path = media_storage[paper_id]["video_path"]
    
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    return FileResponse(
        video_path,
        media_type='video/mp4',
        filename=f"presentation_{paper_id}.mp4"
    )

@router.get("/{paper_id}/download-audio/{filename}")
async def download_audio(paper_id: str, filename: str):
    """Download individual audio files."""
    
    if paper_id not in media_storage:
        raise HTTPException(status_code=404, detail="Media not found")
    
    audio_dir = media_storage[paper_id].get("audio_dir")
    if not audio_dir:
        raise HTTPException(status_code=404, detail="Audio directory not found")
    
    audio_path = os.path.join(audio_dir, filename)
    
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        audio_path,
        media_type='audio/wav',
        filename=filename
    )

@router.get("/{paper_id}/stream-video")
async def stream_video(paper_id: str, request: Request):
    if paper_id not in media_storage:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get the actual stored video path instead of constructing it
    video_path = media_storage[paper_id].get("video_path")
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

# ==========================
# Twitter Thread Generation
# ==========================

@router.post("/{paper_id}/generate-twitter-thread")
async def generate_twitter_thread_post(paper_id: str):

    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")

    if paper_id not in scripts_storage:
        raise HTTPException(status_code=404, detail="Scripts not found")
    
    if paper_id in threads_storage:
        return {
           "paper_id": paper_id,
           "thread": threads_storage[paper_id],
           "status": "already_generated"
        }

    paper = papers_storage[paper_id]
    scripts = scripts_storage[paper_id]

    paper_text = get_paper_text(paper_id)

    if not paper_text:
        raise HTTPException(status_code=404, detail="Paper text not found")

    paper_title = (
        paper.get("title")
        or paper.get("metadata", {}).get("title")
        or "Research Paper"
    )

    authors = paper.get("metadata", {}).get("authors", "Unknown Authors")
    year = paper.get("metadata", {}).get("year", "N/A")

    paper_metadata = {
        "title": paper_title,
        "authors": authors,
        "year": year
    }

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY not configured")

    # 🔥 IMPORTANT — import your function properly
    from app.services.generate_twitter_thread import generate_twitter_thread

    tweets = generate_twitter_thread(api_key, paper_metadata, paper_text)
    # SAVE THREAD
    threads_storage[paper_id] = tweets

    return {
        "paper_id": paper_id,
        "thread": tweets
    }


@router.get("/{paper_id}/list-thread-images")
async def list_thread_images(paper_id: str):

    paper_info = papers_storage.get(paper_id, {})
    source_type = paper_info.get("source_type", "paper")

    # LaTeX case
    if source_type == "latex":

        latex_root = os.path.join("temp", "papers", paper_id, "source")

        image_paths = []

        for root, dirs, files in os.walk(latex_root):

            # 🔥 Remove macOS metadata folders
            dirs[:] = [d for d in dirs if d != "__MACOSX"]

            for file in files:

                # ignore hidden macOS files
                if file.startswith("."):
                    continue

                if file.lower().endswith((".png", ".jpg", ".jpeg")):

                    full_path = os.path.join(root, file)

                    relative_path = os.path.relpath(full_path, latex_root)

                    image_paths.append(relative_path)

        if not image_paths:
            raise HTTPException(status_code=404, detail="Images not found")

        return {"images": sorted(image_paths)}

    # PDF / arXiv case
    images_folder = get_images_folder(paper_id)

    if not images_folder:
        raise HTTPException(status_code=404, detail="Images folder not found")

    image_files = [
        file for file in os.listdir(images_folder)
        if file.lower().endswith((".png", ".jpg", ".jpeg"))
    ]

    return {"images": sorted(image_files)}

@router.get("/{paper_id}/download-thread-image/{filename:path}")
async def download_single_image(paper_id: str, filename: str):

    paper_info = papers_storage.get(paper_id, {})
    source_type = paper_info.get("source_type", "paper")

    # LaTeX
    if source_type == "latex":

        latex_root = os.path.join("temp", "papers", paper_id, "source")

        file_path = os.path.join(latex_root, filename)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Image not found")

        return FileResponse(file_path, media_type="image/png", filename=os.path.basename(filename))

    # PDF / arXiv
    images_folder = get_images_folder(paper_id)

    if not images_folder:
        raise HTTPException(status_code=404, detail="Images folder not found")

    file_path = os.path.join(images_folder, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(file_path, media_type="image/png", filename=filename)


@router.get("/{paper_id}/download-thread-images")
async def download_thread_images(paper_id: str):

    paper_info = papers_storage.get(paper_id, {})
    source_type = paper_info.get("source_type", "paper")

    output_dir = os.path.join("temp", "papers", paper_id)
    os.makedirs(output_dir, exist_ok=True)

    zip_path = os.path.join(output_dir, "thread_images.zip")

    import zipfile

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:

        # -------- LATEX CASE --------
        if source_type == "latex":

            latex_root = os.path.join("temp", "papers", paper_id, "source")

            for root, dirs, files in os.walk(latex_root):

                # ignore mac folders
                dirs[:] = [d for d in dirs if d != "__MACOSX"]

                for file in files:

                    if not file.lower().endswith((".png", ".jpg", ".jpeg")):
                        continue

                    full_path = os.path.join(root, file)

                    if not os.path.exists(full_path):
                        continue

                    zipf.write(full_path, file)

        # -------- PDF / ARXIV CASE --------
        else:

            images_folder = get_images_folder(paper_id)

            if not images_folder:
                raise HTTPException(status_code=404, detail="Images not found")

            for file in os.listdir(images_folder):

                if not file.lower().endswith((".png", ".jpg", ".jpeg")):
                    continue

                full_path = os.path.join(images_folder, file)

                if not os.path.exists(full_path):
                    continue

                zipf.write(full_path, file)

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"twitter_thread_images_{paper_id}.zip"
    )
@router.post("/{paper_id}/generate-audio-bhashini", response_model=MediaResponse)
async def generate_audio_bhashini(
    paper_id: str,
    request: AudioGenerationRequest,
    api_keys: dict = Depends(get_api_keys)
):
    print(f"using voice selection:, {request.voice_selection}")
    print(f"Generating audio for paper ID: {paper_id}")
    lang = request.selected_language
    gender = "male"
    print("lang", lang)
    if paper_id not in scripts_storage:
        scripts_file = f"temp/scripts/{paper_id}_scripts.json"
        if os.path.exists(scripts_file):
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

         # Load model details for MT and TTS
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        print("BASE_DIR", BASE_DIR)
        MODEL_PATH = os.path.join(BASE_DIR, "..", "services", "models.json")

        api_url = None
        access_token = None
        with open(MODEL_PATH, "r") as f:
            data = json.load(f)


        sections_scripts = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if isinstance(section_data, dict):
                sections_scripts[section_name] = section_data.get("script", "")
            else:
                sections_scripts[section_name] = str(section_data)

        
        # translate to required lang if required
        if lang == "English":
            print(f"Generating {lang} script")
            title_intro_script = scripts_info.get("title_intro_script", "")
            language = "English"
        else:
            print(f"Generating {lang} script")
            # print(f"Title intro script: {scripts_info.get('title_intro_script', '')}")

            if isinstance(data, list):
                for item in data:
                    if (
                        item.get("model_type") == "mt"
                        and item.get("source_language") == "English"
                        and item.get("target_language") == lang
                    ):
                        api_url = item.get("api_url")
                        access_token = item.get("access_token")

                headers = {"access-token": access_token}

                title_intro = await bhashini_mt(
                    scripts_info.get("title_intro_script", ""),
                    headers,
                    api_url
                )
                nonEngish_sections_scripts = {
                    name: await bhashini_mt(script, headers, api_url)
                    for name, script in sections_scripts.items()
                }
                print("title_intro", title_intro)
                print("nonEngish_sections_scripts", nonEngish_sections_scripts)
                title_intro_script = title_intro
                sections_scripts = nonEngish_sections_scripts
        


        # generate audio
        
        for item in data:
            if (
                item.get("model_type") == "tts"
                and item.get("source_language") == lang
            ):
                api_url = item.get("api_url")
                access_token = item.get("access_token")

        headers = {"access-token": access_token}


        print("calling aduio generator of bhashini ")
        section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
        audio_response = await ensure_audio_is_generated_bhashini(
            language=lang,
            gender = gender,
            headers = headers,
            api_url = api_url,
            paper_id=paper_id,
            title_intro_script=title_intro_script,
            sections_scripts=sections_scripts,
            section_order=section_order
            
        )
        print("audio_response", audio_response)


        audio_files = audio_response["audio_files"]
        if paper_id not in media_storage:
            media_storage[paper_id] = {}

        media_storage[paper_id]["audio_files"] = [os.path.join(audio_dir, f) for f in audio_files]
        media_storage[paper_id]["audio_dir"] = audio_dir

        return MediaResponse(
            audio_files=audio_files,
            paper_id=paper_id
        )

    except Exception as e:
        print(f"Error generating audio: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")
