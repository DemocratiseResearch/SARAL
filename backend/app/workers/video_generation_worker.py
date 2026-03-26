"""
Video Generation Worker
-----------------------
Dedicated worker for CPU/memory-intensive MoviePy video generation.
Decouples video processing from API endpoints to prevent resource exhaustion.

Architecture:
- Queue: video_generation_queue
- Instances: 2 workers (limited by VIDEO_GENERATION_SEMAPHORE in media.py)
- Resources: 2 CPUs, 8GB RAM per instance
- Timeout: 10 minutes per video generation

Task: generate_video_task
- Input: paper_id, slide_images, audio_files, background_music_file, output_file, selected_language
- Output: video_path, caption
"""

import asyncio
import os
import logging
from pathlib import Path
from typing import List, Optional, Dict
from arq import create_pool
from arq.connections import RedisSettings

# Import video generation service
from app.services.video_service import create_video_with_audio
from app.services.linkedin_caption_service import generate_linkedin_caption_points
from app.services.script_generator import extract_text_from_file
from app.services.storage_manager import storage_manager
from app.utils.timing import track_performance, track_worker_job
from app.utils.context import set_execution_context

# Import in-memory storage (if needed)
from app.routes.papers import papers_storage

logger = logging.getLogger(__name__)


@track_performance
def generate_video_with_moviepy(
    slide_images: List[str],
    audio_files: List[str],
    background_music_file: Optional[str],
    output_file: str
) -> str:
    """
    Call the MoviePy video generation service.
    This is the actual CPU-intensive operation that uses MoviePy.
    """
    logger.info(f"Starting MoviePy video generation: {os.path.basename(output_file)}")
    logger.info(f"  Slides: {len(slide_images)}, Audio files: {len(audio_files)}")
    
    video_path = create_video_with_audio(
        slide_images=slide_images,
        audio_files=audio_files,
        background_music_file=background_music_file,
        output_file=output_file
    )
    
    logger.info(f"MoviePy video generation completed: {video_path}")
    return video_path


@track_performance
def generate_linkedin_caption_safe(paper_id: str) -> Optional[str]:
    """
    Non-blocking LinkedIn caption generation.
    Returns None if any step fails (doesn't block video generation).
    """
    try:
        logger.info(f"[{paper_id[:8]}] Attempting LinkedIn caption generation")
        
        # Get paper info from storage
        paper_info = storage_manager.get_paper(paper_id)
        if not paper_info:
            # Fallback to in-memory storage
            if paper_id in papers_storage:
                paper_info = papers_storage[paper_id]
            else:
                logger.warning(f"[{paper_id[:8]}] Paper info not found, skipping caption")
                return None
        
        if not paper_info:
            return None
        
        # Get Gemini API key
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            logger.warning(f"[{paper_id[:8]}] GEMINI_API_KEY not set, skipping caption")
            return None
        
        # Get text file path - check both tex_file_path (for arXiv/LaTeX) and text_file_path (for PDF)
        text_file_path = None
        if "tex_file_path" in paper_info and paper_info["tex_file_path"]:
            text_file_path = paper_info["tex_file_path"]
            logger.info(f"[{paper_id[:8]}] Using tex_file_path: {text_file_path}")
        elif "text_file_path" in paper_info and paper_info["text_file_path"]:
            text_file_path = paper_info["text_file_path"]
            logger.info(f"[{paper_id[:8]}] Using text_file_path: {text_file_path}")
        
        if not text_file_path or not os.path.exists(text_file_path):
            logger.warning(f"[{paper_id[:8]}] Text file not found, skipping caption")
            return None
        
        # Extract text from file
        paper_text = extract_text_from_file(text_file_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            logger.warning(f"[{paper_id[:8]}] Insufficient paper content, skipping caption")
            return None
        
        # Get metadata
        metadata = paper_info.get("metadata", {})
        
        # Generate caption
        caption = generate_linkedin_caption_points(
            api_key=gemini_key,
            paper_metadata=metadata,
            paper_text=paper_text
        )
        
        logger.info(f"[{paper_id[:8]}] ✅ LinkedIn caption generated successfully")
        return caption
        
    except Exception as e:
        logger.warning(f"[{paper_id[:8]}] Caption generation failed (non-critical): {str(e)}")
        return None


@track_worker_job  # Track the entire video generation job
async def generate_video_task(
    ctx,
    paper_id: str,
    slide_images: List[str],
    audio_files: List[str],
    background_music_file: Optional[str],
    output_file: str,
    selected_language: str,
    execution_context: str = "VIDEO_GENERATION_WORKER"
):
    """
    Main video generation task executed by the worker.
    
    Args:
        ctx: ARQ context
        paper_id: Unique paper identifier
        slide_images: List of slide image paths
        audio_files: List of audio file paths
        background_music_file: Optional background music path
        output_file: Output video file path
        selected_language: Language for video filename
        execution_context: Context identifier for tracking
    
    Returns:
        dict: {
            "status": "success",
            "paper_id": str,
            "video_path": str (basename),
            "caption": str (optional),
            "audio_files": List[str] (basenames)
        }
    """
    # Set the execution context for this worker
    set_execution_context(execution_context)
    
    logger.info(f"[{paper_id[:8]}] Video generation task started")
    logger.info(f"[{paper_id[:8]}]   Slides: {len(slide_images)}")
    logger.info(f"[{paper_id[:8]}]   Audio: {len(audio_files)}")
    logger.info(f"[{paper_id[:8]}]   Language: {selected_language}")
    
    try:
        # Validate inputs
        if not slide_images or not audio_files:
            raise ValueError("Slide images and audio files are required")
        
        # Ensure output directory exists
        Path(os.path.dirname(output_file)).mkdir(parents=True, exist_ok=True)
        
        # Generate video using MoviePy (tracked)
        video_path = generate_video_with_moviepy(
            slide_images=slide_images,
            audio_files=audio_files,
            background_music_file=background_music_file,
            output_file=output_file
        )
        
        if not video_path or not os.path.exists(video_path):
            raise ValueError(f"Video generation failed: {output_file}")
        
        logger.info(f"[{paper_id[:8]}] Video created: {os.path.basename(video_path)}")
        
        # Generate LinkedIn caption (non-blocking, tracked)
        caption = generate_linkedin_caption_safe(paper_id)
        
        # Prepare response
        result = {
            "status": "success",
            "paper_id": paper_id,
            "video_path": os.path.basename(video_path),
            "caption": caption,
            "audio_files": [os.path.basename(f) for f in audio_files]
        }
        
        logger.info(f"[{paper_id[:8]}] Video generation task completed successfully")
        return result
        
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] Video generation task failed: {str(e)}")
        # Clean up on failure
        if os.path.exists(output_file):
            try:
                os.remove(output_file)
            except:
                pass
        raise


async def startup(ctx):
    logger.info("Video Generation Worker starting up...")


async def shutdown(ctx):
    logger.info("Video Generation Worker shutting down...")


class VideoGenerationWorkerSettings:
    """Configuration for video generation worker."""
    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [generate_video_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'video_generation_queue'
    max_jobs = 2  # Limit to 2 concurrent video generations (resource protection)
    job_timeout = 600  # 10 minutes for video generation
    keep_result = 7200  # Keep results for 2 hours
    allow_abort_jobs = True
    max_tries = 3


if __name__ == '__main__':
    import sys
    from arq import run_worker
    
    sys.exit(run_worker(VideoGenerationWorkerSettings))
