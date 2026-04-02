import asyncio
import os
import logging
import shutil
from pathlib import Path
from arq import create_pool
from arq.connections import RedisSettings

from datetime import datetime

# Import all necessary services
from app.services.storage_manager import storage_manager
import app.services.script_to_video as script_to_video
from app.services.sarvam_sdk import SarvamTTS
from app.utils.timing import track_performance
from app.utils.context import set_execution_context
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# In-memory storage
papers_storage = {}

@track_performance
def save_paper_info(paper_id: str, info: dict):
    """Save paper info to both memory and persistent storage."""
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)


@track_performance
async def process_pdf_to_video_full_task(
    ctx,
    pdf_path: str,
    paper_id: str,
    tts_source: str,
    api_keys: dict,
    execution_context: str = "WORKER_fallback"
):
    """
    Complete pipeline: PDF processing -> scripts -> slides -> audio -> video.
    This runs the entire paper-to-video conversion in one task.
    """
    # Set the execution context for this worker
    set_execution_context(execution_context)
    
    logger.info(f"[{paper_id[:8]}] Starting PDF to video pipeline")
    
    try:
        # Stage 1: Process PDF file using pdf_processor_worker
        logger.info(f"[{paper_id[:8]}] Stage 1: Enqueuing PDF processing job")
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise ValueError("Gemini API key not configured")
        
        # Enqueue PDF processing to dedicated worker
        pool = await create_pool(RedisSettings(host='localhost', port=6379, database=0))
        pdf_job = await pool.enqueue_job(
            'process_pdf_file_task',
            pdf_path,
            paper_id,
            "paper",
            gemini_api_key,
            _queue_name='pdf_processor_queue'
        )
        
        # Wait for PDF processing to complete
        logger.info(f"[{paper_id[:8]}] Waiting for PDF processing to complete...")
        result = await pdf_job.result(timeout=1800, poll_delay=2.0)
        await pool.close()
        
        if not result:
            raise ValueError("PDF processing returned no result")
        
        result["source_type"] = "pdf"
        save_paper_info(paper_id, result)
        logger.info(f"[{paper_id[:8]}] PDF processed successfully")
        
        # Stage 2: Generate scripts
        logger.info(f"[{paper_id[:8]}] Stage 2: Generating scripts")
        _s2_start = datetime.now()
        try:
            update_pipeline_step(paper_id, "script_generation", metadata={}, started_at=_s2_start, status="in_progress")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        try:
            await script_to_video.generate_scripts(paper_id, api_keys)
        except Exception as _e:
            try:
                mark_pipeline_failed(paper_id, "script_generation", _e, started_at=_s2_start)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise
        try:
            update_pipeline_step(paper_id, "script_generation", metadata={}, started_at=_s2_start, status="completed")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")

        # Stage 3: Generate slides
        logger.info(f"[{paper_id[:8]}] Stage 3: Generating slides")
        _s3_start = datetime.now()
        try:
            update_pipeline_step(paper_id, "slides_generation", metadata={}, started_at=_s3_start, status="in_progress")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        try:
            await script_to_video.generate_slides(paper_id, api_keys)
        except Exception as _e:
            try:
                mark_pipeline_failed(paper_id, "slides_generation", _e, started_at=_s3_start)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise
        try:
            update_pipeline_step(paper_id, "slides_generation", metadata={}, started_at=_s3_start, status="completed")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")

        # Stage 4: Generate audio
        logger.info(f"[{paper_id[:8]}] Stage 4: Generating audio")
        _s4_start = datetime.now()
        try:
            update_pipeline_step(paper_id, "audio_generation", metadata={"tts_source": tts_source}, started_at=_s4_start, status="in_progress")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        try:
            if tts_source == "sarvam":
                # Test connection in this worker (calling process — per design)
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
                    None,   # title_intro_script — read from disk by the audio worker
                    None,   # sections_scripts — read from disk by the audio worker
                    3,      # hinglish_iterations
                    api_keys.get("openai_key"),
                    False,  # show_hindi_debug
                    "AUDIO_WORKER_PDF",
                    _queue_name='audio_generation_queue',
                )
                _audio_result = await _audio_job.result(timeout=600, poll_delay=1.0)
                await _audio_pool.close()

                # Restore media_storage so Stage 5 (video gen) can locate the audio files
                _audio_dir = _audio_result["audio_dir"]
                if paper_id not in script_to_video.media_storage:
                    script_to_video.media_storage[paper_id] = {}
                script_to_video.media_storage[paper_id]["audio_files"] = [
                    os.path.join(_audio_dir, f) for f in _audio_result["audio_files"]
                ]
                script_to_video.media_storage[paper_id]["audio_dir"] = _audio_dir
                logger.info(
                    f"[{paper_id[:8]}] Audio worker done: {len(_audio_result['audio_files'])} file(s)"
                )
            elif tts_source == "bhashini":
                await script_to_video.generate_bhashini_audio(paper_id, api_keys, "English", "male")
        except Exception as _e:
            try:
                mark_pipeline_failed(paper_id, "audio_generation", _e, started_at=_s4_start)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise
        try:
            update_pipeline_step(paper_id, "audio_generation", metadata={"tts_source": tts_source}, started_at=_s4_start, status="completed")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")

        # Stage 5: Generate video
        logger.info(f"[{paper_id[:8]}] Stage 5: Generating video")
        _s5_start = datetime.now()
        try:
            update_pipeline_step(paper_id, "video_generation", metadata={}, started_at=_s5_start, status="in_progress")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        try:
            video_info = await script_to_video.generate_video(paper_id, api_keys)
        except Exception as _e:
            try:
                mark_pipeline_failed(paper_id, "video_generation", _e, started_at=_s5_start)
            except Exception as _pe:
                logger.warning(f"Pipeline tracking error: {_pe}")
            raise
        try:
            update_pipeline_step(paper_id, "video_generation",
                metadata={"video_path": str(video_info.get("video_path", "")) if isinstance(video_info, dict) else ""},
                started_at=_s5_start, status="completed")
        except Exception as _pe:
            logger.warning(f"Pipeline tracking error: {_pe}")
        
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
    logger.info("PDF to Video Worker starting up...")

@track_performance
async def shutdown(ctx):
    logger.info("PDF to Video Worker shutting down...")


class PDFToVideoWorkerSettings:
    """Configuration for PDF to video worker."""
    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [process_pdf_to_video_full_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'pdf_to_video_queue'
    max_jobs = 2
    job_timeout = 1800  # 30 minutes for full pipeline
    keep_result = 7200  # Keep results for 2 hours
    allow_abort_jobs = True
    max_tries = 3


if __name__ == '__main__':
    import sys
    from arq import run_worker
    
    sys.exit(run_worker(PDFToVideoWorkerSettings))
