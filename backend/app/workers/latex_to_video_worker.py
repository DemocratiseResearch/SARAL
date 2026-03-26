import asyncio
import os
import logging
import shutil
import zipfile
from pathlib import Path
from arq import create_pool
from arq.connections import RedisSettings

from datetime import datetime

# Import all necessary services
from app.services.storage_manager import storage_manager
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from app.services.script_generator import extract_paper_metadata
import app.services.script_to_video as script_to_video
from app.services.sarvam_sdk import SarvamTTS
from app.utils.timing import track_performance, track_worker_job
from app.utils.context import set_execution_context
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed

logger = logging.getLogger(__name__)

# In-memory storage
papers_storage = {}


@track_performance
def save_paper_info(paper_id: str, info: dict):
    """Save paper info to both memory and persistent storage."""
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)


@track_performance
async def extract_latex_zip(zip_path: str, temp_dir: str, paper_id: str):
    """Extract LaTeX ZIP file."""
    logger.info(f"[{paper_id[:8]}] Extracting LaTeX ZIP file")
    extract_dir = os.path.join(temp_dir, "source")
    
    # Run ZIP extraction in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: zipfile.ZipFile(zip_path, 'r').extractall(extract_dir)
    )
    
    return extract_dir


@track_performance
async def process_latex_files_latex(extract_dir: str, paper_id: str):
    """Process LaTeX files to extract metadata and images."""
    logger.info(f"[{paper_id[:8]}] Processing LaTeX files")
    
    # Find main .tex file
    tex_file_path = find_tex_file(extract_dir)
    
    # Extract metadata
    metadata = extract_paper_metadata(tex_file_path)
    
    # Find images
    image_refs = find_image_references(tex_file_path)
    image_files = find_image_files(extract_dir, image_refs)
    
    return {
        "metadata": metadata,
        "tex_file_path": tex_file_path,
        "image_files": image_files
    }


@track_performance
async def generate_scripts_stage_latex(paper_id: str, api_keys: dict):
    """Track script generation stage."""
    logger.info(f"[{paper_id[:8]}] Stage 2: Generating scripts")
    _started_at = datetime.now()
    try:
        update_pipeline_step(paper_id, "script_generation", metadata={}, started_at=_started_at, status="in_progress")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")
    try:
        await script_to_video.generate_scripts(paper_id, api_keys)
    except Exception as _e:
        try:
            mark_pipeline_failed(paper_id, "script_generation", _e, started_at=_started_at)
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        raise
    try:
        update_pipeline_step(paper_id, "script_generation", metadata={}, started_at=_started_at, status="completed")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")


@track_performance
async def generate_slides_stage_latex(paper_id: str, api_keys: dict):
    """Track slides generation stage."""
    logger.info(f"[{paper_id[:8]}] Stage 3: Generating slides")
    _started_at = datetime.now()
    try:
        update_pipeline_step(paper_id, "slides_generation", metadata={}, started_at=_started_at, status="in_progress")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")
    try:
        await script_to_video.generate_slides(paper_id, api_keys)
    except Exception as _e:
        try:
            mark_pipeline_failed(paper_id, "slides_generation", _e, started_at=_started_at)
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        raise
    try:
        update_pipeline_step(paper_id, "slides_generation", metadata={}, started_at=_started_at, status="completed")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")


@track_performance
async def generate_audio_stage_latex(paper_id: str, api_keys: dict, tts_source: str):
    """Track audio generation stage."""
    logger.info(f"[{paper_id[:8]}] Stage 4: Generating audio using {tts_source}")
    _started_at = datetime.now()
    try:
        update_pipeline_step(paper_id, "audio_generation", metadata={"tts_source": tts_source}, started_at=_started_at, status="in_progress")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")
    try:
        if tts_source == "sarvam":
            _sarvam_key = api_keys.get("sarvam_key")
            _tts_check = SarvamTTS(api_key=_sarvam_key)
            if not _tts_check.test_connection():
                raise RuntimeError("Sarvam TTS connection test failed before dispatching audio job")
            logger.info(f"[{paper_id[:8]}] Sarvam TTS verified, dispatching to audio worker")

            _audio_pool = await create_pool(RedisSettings(host='localhost', port=6379, database=0))
            _audio_job = await _audio_pool.enqueue_job(
                'generate_paper_audio_task',
                paper_id,
                _sarvam_key,
                "English",
                {"English": "simran"},
                ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"],
                None,   # title_intro_script — read from disk by audio worker
                None,   # sections_scripts  — read from disk by audio worker
                3,      # hinglish_iterations
                api_keys.get("openai_key"),
                False,  # show_hindi_debug
                "AUDIO_WORKER_LATEX",
                _queue_name='audio_generation_queue',
            )
            _audio_result = await _audio_job.result(timeout=600, poll_delay=1.0)
            await _audio_pool.close()

            _audio_dir = _audio_result["audio_dir"]
            if paper_id not in script_to_video.media_storage:
                script_to_video.media_storage[paper_id] = {}
            script_to_video.media_storage[paper_id]["audio_files"] = [
                os.path.join(_audio_dir, f) for f in _audio_result["audio_files"]
            ]
            script_to_video.media_storage[paper_id]["audio_dir"] = _audio_dir
            logger.info(f"[{paper_id[:8]}] Audio worker done: {len(_audio_result['audio_files'])} file(s)")
        elif tts_source == "bhashini":
            await script_to_video.generate_bhashini_audio(paper_id, api_keys, "English", "male")
    except Exception as _e:
        try:
            mark_pipeline_failed(paper_id, "audio_generation", _e, started_at=_started_at)
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        raise
    try:
        update_pipeline_step(paper_id, "audio_generation", metadata={"tts_source": tts_source}, started_at=_started_at, status="completed")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")


@track_performance
async def generate_video_stage_latex(paper_id: str, api_keys: dict):
    """Track video generation stage."""
    logger.info(f"[{paper_id[:8]}] Stage 5: Generating video")
    _started_at = datetime.now()
    try:
        update_pipeline_step(paper_id, "video_generation", metadata={}, started_at=_started_at, status="in_progress")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")
    try:
        video_info = await script_to_video.generate_video(paper_id, api_keys)
    except Exception as _e:
        try:
            mark_pipeline_failed(paper_id, "video_generation", _e, started_at=_started_at)
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        raise
    try:
        update_pipeline_step(paper_id, "video_generation",
            metadata={"video_path": str(video_info.get("video_path", "")) if isinstance(video_info, dict) else ""},
            started_at=_started_at, status="completed")
    except Exception as _pe:
        logger.warning(f"Pipeline tracking error: {_pe}")
    return video_info


@track_worker_job  # Track the entire pipeline job
async def process_latex_to_video_full_task(
    ctx,
    zip_path: str,
    paper_id: str,
    tts_source: str,
    api_keys: dict,
    execution_context: str = "LATEX_TO_VIDEO_PIPELINE"
):
    """
    Complete pipeline: LaTeX extraction -> scripts -> slides -> audio -> video.
    """
    # Set the execution context for this worker
    set_execution_context(execution_context)
    
    try:
        # Stage 1: Extract and process LaTeX
        temp_dir = f"temp/papers/{paper_id}"
        
        # Extract ZIP file (tracked)
        extract_dir = await extract_latex_zip(zip_path, temp_dir, paper_id)
        
        # Process LaTeX files (tracked)
        latex_data = await process_latex_files_latex(extract_dir, paper_id)
        
        # Store paper info
        paper_info = {
            "metadata": latex_data["metadata"],
            "tex_file_path": latex_data["tex_file_path"],
            "source_dir": extract_dir,
            "image_files": latex_data["image_files"],
            "zip_file_path": zip_path,
            "status": "processed",
            "source_type": "latex"
        }
        save_paper_info(paper_id, paper_info)
        logger.info(f"[{paper_id[:8]}] LaTeX processed successfully")
        
        # Stage 2-5: Run each stage with tracking
        await generate_scripts_stage_latex(paper_id, api_keys)
        await generate_slides_stage_latex(paper_id, api_keys)
        await generate_audio_stage_latex(paper_id, api_keys, tts_source)
        video_info = await generate_video_stage_latex(paper_id, api_keys)
        
        logger.info(f"[{paper_id[:8]}] Pipeline completed successfully")
        return {
            "status": "success",
            "paper_id": paper_id,
            "video_info": video_info
        }
        
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] Pipeline failed: {str(e)}")
        # Clean up temp directory
        temp_dir = f"temp/papers/{paper_id}"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise

@track_performance
async def startup(ctx):
    logger.info("LaTeX to Video Worker starting up...")

@track_performance
async def shutdown(ctx):
    logger.info("LaTeX to Video Worker shutting down...")


class LatexToVideoWorkerSettings:
    """Configuration for LaTeX to video worker."""
    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [process_latex_to_video_full_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'latex_to_video_queue'
    max_jobs = 2
    job_timeout = 1800  # 30 minutes for full pipeline
    keep_result = 7200  # Keep results for 2 hours
    allow_abort_jobs = True
    max_tries = 3


if __name__ == '__main__':
    import sys
    from arq import run_worker
    
    sys.exit(run_worker(LatexToVideoWorkerSettings))
