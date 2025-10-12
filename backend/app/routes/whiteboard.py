"""
Whiteboard Video Generation Routes
Handles whiteboard-style video generation with hand-drawing animations
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import logging
from pathlib import Path

from ..services.whiteboard_service import create_whiteboard_animation
from ..services.script_planner import create_video_script
from ..services.unified_tts_service import generate_audio_unified
from ..routes.api_keys import get_api_keys
from app.routes.scripts import (
    scripts_storage,
    load_scripts_from_file,
    resolve_paper_id,
    save_scripts_to_file,
)
from ..routes.papers import papers_storage
from ..services.script_generator import (
    generate_full_script_with_gemini,
    split_script_into_sections,
    clean_script_for_tts_and_video,
    generate_title_introduction,
    extract_text_from_file,
    clean_text,
    generate_all_bullet_points_with_gemini,
)

router = APIRouter()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WhiteboardGenerationRequest(BaseModel):
    image_model: str = "pollinations"  # "pollinations", "gemini", or "sd"
    scenes_count: Optional[int] = None
    tts_provider: str = "kokoro"  # "kokoro", "bhashini", or "sarvam"
    tts_gender: str = "female"  # For Bhashini: "male" or "female"
    tts_language: str = (
        "english"  # For Bhashini: "english", "hindi", "gujarati", "marathi", "telugu"
    )


class WhiteboardPreviewRequest(BaseModel):
    target_duration: Optional[float] = None
    tts_provider: str = "kokoro"
    tts_gender: str = "female"
    tts_language: str = "english"


class ScenePreview(BaseModel):
    scene_number: int
    start_time: float
    duration: float
    image_prompt: str
    narration: str


class WhiteboardPreviewResponse(BaseModel):
    success: bool
    narration_script: Optional[str]
    scenes: Optional[List[ScenePreview]]
    total_duration: Optional[float]
    word_count: Optional[int]
    message: str


class WhiteboardResponse(BaseModel):
    video_path: Optional[str]
    narration: Optional[str]
    scenes_count: Optional[int]
    success: bool
    message: str


# In-memory storage for whiteboard data
whiteboard_storage = {}


async def auto_generate_scripts_if_needed(paper_id: str, gemini_api_key: str) -> dict:
    """Auto-generate scripts if they don't exist for the paper"""
    try:
        logger.info(f"🔄 Auto-generating scripts for paper {paper_id}")

        # Get paper info
        paper_info = None
        if paper_id in papers_storage:
            paper_info = papers_storage[paper_id]
        else:
            # Try to load from storage manager
            from ..services.storage_manager import storage_manager

            paper_info = storage_manager.get_paper(paper_id)

        if not paper_info:
            logger.error(f"❌ Paper {paper_id} not found in storage")
            return {}

        # Get file path
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
        else:
            logger.error(f"❌ No file path found for paper {paper_id}")
            return {}

        # Get metadata
        metadata = paper_info.get("metadata", {})

        # Generate title introduction
        title_intro = generate_title_introduction(
            metadata.get("title", "Research Paper"),
            metadata.get("authors", "Author"),
            metadata.get("date", "2024"),
        )

        # Extract and clean text
        input_text = extract_text_from_file(file_path)
        input_text = clean_text(input_text)

        # Generate full script
        logger.info("📝 Generating full script with Gemini...")
        full_script = generate_full_script_with_gemini(gemini_api_key, input_text)

        # Split into sections
        sections_scripts = split_script_into_sections(full_script)

        # Clean each section
        cleaned_sections = {}
        for section_name, script_text in sections_scripts.items():
            cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)

        # Generate bullet points
        logger.info("🎯 Generating bullet points...")
        all_bullet_points = generate_all_bullet_points_with_gemini(
            gemini_api_key, cleaned_sections
        )

        # Combine into final structure
        sections_with_bullets = {}
        for section_name in cleaned_sections.keys():
            sections_with_bullets[section_name] = {
                "script": cleaned_sections[section_name],
                "bullet_points": all_bullet_points.get(
                    section_name, ["Key information from this section"]
                ),
                "assigned_image": None,
            }

        # Store script data
        script_data = {
            "title_intro": title_intro,
            "sections": sections_with_bullets,
            "full_script": full_script,
        }

        # Save to file and memory
        save_scripts_to_file(paper_id, script_data)
        scripts_storage[paper_id] = script_data

        logger.info(f"✅ Successfully auto-generated scripts for paper {paper_id}")
        return script_data

    except Exception as e:
        logger.error(f"❌ Error auto-generating scripts: {str(e)}", exc_info=True)
        return {}


@router.post("/preview/{paper_id}", response_model=WhiteboardPreviewResponse)
async def preview_whiteboard_script(
    paper_id: str,
    request: WhiteboardPreviewRequest,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Preview whiteboard script before generation
    Shows narration and visual scene breakdown
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for script planning"
            )

        # Resolve arxiv ID to UUID if needed
        resolved_id = resolve_paper_id(paper_id)
        logging.info(
            f"📋 Previewing whiteboard script for paper: {paper_id} (resolved to {resolved_id})"
        )

        # Check if paper exists
        paper_exists = False
        if resolved_id in papers_storage:
            paper_exists = True
        else:
            from ..services.storage_manager import storage_manager

            if storage_manager.get_paper(resolved_id):
                paper_exists = True

        if not paper_exists:
            logger.error(f"❌ Paper {paper_id} (resolved: {resolved_id}) not found")
            raise HTTPException(
                status_code=404,
                detail=f"Paper {paper_id} not found. Please upload the paper first at /papers/upload or search for it.",
            )

        # Try to load scripts data from memory or disk
        scripts_data = None
        if resolved_id in scripts_storage:
            scripts_data = scripts_storage[resolved_id]
        else:
            scripts_data = load_scripts_from_file(resolved_id)
            if not scripts_data:
                logger.info(
                    f"🔄 Scripts not found for {resolved_id}, auto-generating..."
                )
                scripts_data = await auto_generate_scripts_if_needed(
                    resolved_id, api_keys["gemini_key"]
                )

                if not scripts_data:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to generate scripts for {paper_id}. Please ensure the paper exists and try again.",
                    )

        # Get narration script
        narration = scripts_data.get("video_script", scripts_data.get("script", ""))

        # If no direct narration, try to build from sections
        if not narration and "sections" in scripts_data:
            logging.info("📝 Building narration from sections")
            narration_parts = []
            for section_name, section_data in scripts_data["sections"].items():
                if isinstance(section_data, dict) and "script" in section_data:
                    narration_parts.append(section_data["script"])
            narration = " ".join(narration_parts)

        if not narration:
            raise HTTPException(
                status_code=400,
                detail="No narration script available. The scripts exist but have no content. Please regenerate scripts at /script-generation",
            )

        # Trim narration to ~100 seconds (250 words at 2.5 words/sec)
        words = narration.split()
        word_count = len(words)
        target_words = 250  # ~100 seconds at 2.5 words per second

        if word_count > target_words:
            logging.info(
                f"✂️ Trimming narration from {word_count} to {target_words} words for optimal pacing"
            )
            # Try to trim at sentence boundaries
            narration = " ".join(words[:target_words])
            # Add ellipsis if we cut mid-sentence
            if not narration.endswith((".", "!", "?")):
                narration += "..."
            word_count = len(narration.split())

        # Calculate duration
        estimated_duration = word_count / 2.5  # 2.5 words per second

        if request.target_duration:
            estimated_duration = request.target_duration

        logging.info(f"📝 Narration: {word_count} words, ~{estimated_duration:.1f}s")

        # Generate audio first to get precise timing (TTS provider set in request, default kokoro)
        tts_provider = getattr(request, "tts_provider", "kokoro")
        tts_gender = getattr(request, "tts_gender", "female")
        tts_language = getattr(request, "tts_language", "english")
        audio_file, subtitle_file = generate_audio_unified(
            narration, provider=tts_provider, gender=tts_gender, language=tts_language
        )

        if not audio_file:
            raise HTTPException(status_code=500, detail="Failed to generate audio")

        # Create video script with actual timing
        video_script = create_video_script(
            narration, subtitle_file=subtitle_file, target_duration=estimated_duration
        )

        # Convert to response format
        scenes = [
            ScenePreview(
                scene_number=i + 1,
                start_time=seg.start_time,
                duration=seg.duration,
                image_prompt=seg.image_prompt,
                narration=seg.narration,
            )
            for i, seg in enumerate(video_script.segments)
        ]

        # Store for later generation
        whiteboard_storage[paper_id] = {
            "narration": narration,
            "video_script": video_script,
            "audio_file": audio_file,
            "subtitle_file": subtitle_file,
        }

        return WhiteboardPreviewResponse(
            success=True,
            narration_script=narration,
            scenes=scenes,
            total_duration=video_script.total_duration,
            word_count=word_count,
            message=f"Preview ready: {len(scenes)} scenes, {video_script.total_duration:.1f}s",
        )

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Preview error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/{paper_id}", response_model=WhiteboardResponse)
async def generate_whiteboard_video(
    paper_id: str,
    request: WhiteboardGenerationRequest,
    api_keys: dict = Depends(get_api_keys),
):
    """Generate whiteboard-style video with hand-drawing animation"""
    try:
        # Check API keys based on image model
        if request.image_model == "gemini" and not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400,
                detail="Gemini API key required for Gemini image generation",
            )

        # Resolve arxiv ID to UUID if needed
        resolved_id = resolve_paper_id(paper_id)
        logging.info(
            f"🎬 Generating whiteboard video for paper: {paper_id} (resolved to {resolved_id})"
        )
        logging.info(f"🎨 Image model: {request.image_model}")

        # Check if paper exists
        paper_exists = False
        if resolved_id in papers_storage:
            paper_exists = True
        else:
            from ..services.storage_manager import storage_manager

            if storage_manager.get_paper(resolved_id):
                paper_exists = True

        if not paper_exists:
            logger.error(f"❌ Paper {paper_id} (resolved: {resolved_id}) not found")
            raise HTTPException(
                status_code=404,
                detail=f"Paper {paper_id} not found. Please upload the paper first at /papers/upload or search for it.",
            )

        # Check if we have preview data
        if resolved_id not in whiteboard_storage:
            # Generate fresh if no preview
            if resolved_id not in scripts_storage:
                scripts_data = load_scripts_from_file(resolved_id)
                if not scripts_data:
                    logger.info(
                        f"🔄 Scripts not found for {resolved_id}, auto-generating..."
                    )
                    scripts_data = await auto_generate_scripts_if_needed(
                        resolved_id, api_keys["gemini_key"]
                    )

                    if not scripts_data:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to generate scripts for {paper_id}. Please ensure the paper exists and try again.",
                        )

                scripts_storage[resolved_id] = scripts_data

            scripts_data = scripts_storage[resolved_id]
            narration = scripts_data.get("video_script", scripts_data.get("script", ""))

            # If no direct narration, try to build from sections
            if not narration and "sections" in scripts_data:
                logging.info("📝 Building narration from sections")
                narration_parts = []
                for section_name, section_data in scripts_data["sections"].items():
                    if isinstance(section_data, dict) and "script" in section_data:
                        narration_parts.append(section_data["script"])
                narration = " ".join(narration_parts)

            if not narration:
                raise HTTPException(
                    status_code=400, detail="No narration script available"
                )

            # Trim narration to ~100 seconds (250 words at 2.5 words/sec)
            words = narration.split()
            word_count = len(words)
            target_words = 250  # ~100 seconds at 2.5 words per second

            if word_count > target_words:
                logging.info(
                    f"✂️ Trimming narration from {word_count} to {target_words} words for optimal pacing"
                )
                narration = " ".join(words[:target_words])
                if not narration.endswith((".", "!", "?")):
                    narration += "..."
                word_count = len(narration.split())

            # Generate audio
            logging.info(
                f"🔊 Generating audio narration with {request.tts_provider}..."
            )
            audio_file, subtitle_file = generate_audio_unified(
                narration,
                provider=request.tts_provider,
                gender=request.tts_gender,
                language=request.tts_language,
            )

            if not audio_file:
                raise HTTPException(status_code=500, detail="Failed to generate audio")

            # Calculate duration
            estimated_duration = word_count / 2.5

            # Create video script
            logging.info("📝 Planning visual scenes...")
            video_script = create_video_script(
                narration,
                subtitle_file=subtitle_file,
                target_duration=estimated_duration,
                scenes_count=request.scenes_count,
            )
        else:
            # Use preview data
            logging.info("✓ Using previewed script and audio")
            preview_data = whiteboard_storage[resolved_id]
            narration = preview_data["narration"]
            video_script = preview_data["video_script"]
            audio_file = preview_data["audio_file"]
            subtitle_file = preview_data["subtitle_file"]

        # Generate whiteboard animation
        logging.info("✏️ Creating whiteboard animation...")
        temp_video_path = create_whiteboard_animation(
            video_script=video_script,
            audio_file=audio_file,
            subtitle_file=subtitle_file,
            image_model=request.image_model,
        )

        # Copy to permanent location
        import shutil

        video_dir = Path("temp/videos")
        video_dir.mkdir(parents=True, exist_ok=True)
        permanent_video_path = video_dir / f"whiteboard_{resolved_id}.mp4"

        shutil.copy2(temp_video_path, permanent_video_path)
        video_path = str(permanent_video_path)

        # Clean up temp file
        try:
            os.remove(temp_video_path)
        except:
            pass

        # Save to storage
        whiteboard_storage[resolved_id] = {
            "video_path": video_path,
            "narration": narration,
            "scenes_count": len(video_script.segments),
            "image_model": request.image_model,
        }

        logging.info(f"✅ Whiteboard video saved to: {video_path}")

        return WhiteboardResponse(
            video_path=video_path,
            narration=narration,
            scenes_count=len(video_script.segments),
            success=True,
            message=f"Whiteboard video generated successfully with {len(video_script.segments)} scenes",
        )

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Generation error: {e}", exc_info=True)

        # Check for specific errors
        error_msg = str(e)
        if "POLLINATIONS_DOWN" in error_msg or "502" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Pollinations AI service is currently unavailable. Please try Gemini or Stable Diffusion.",
            )

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{paper_id}")
async def download_whiteboard_video(paper_id: str):
    """Download generated whiteboard video"""
    try:
        # Resolve paper_id to UUID first
        resolved_id = resolve_paper_id(paper_id)

        # Try in-memory first
        video_path = None
        if resolved_id in whiteboard_storage:
            video_data = whiteboard_storage[resolved_id]
            video_path = video_data.get("video_path")

        # If not in memory, try to find on disk
        if not video_path or not os.path.exists(video_path):
            # Look for video in temp/videos/ (new location)
            possible_paths = [
                f"temp/videos/whiteboard_{resolved_id}.mp4",
                f"temp/whiteboard/{resolved_id}.mp4",  # legacy
                f"temp/videos/whiteboard_{paper_id}.mp4",  # fallback
                f"temp/whiteboard/{paper_id}.mp4",  # legacy fallback
            ]

            for possible_path in possible_paths:
                if os.path.exists(possible_path):
                    video_path = possible_path
                    break

            if not video_path:
                raise HTTPException(
                    status_code=404,
                    detail=f"Whiteboard video not found for paper {paper_id}. Please generate it first.",
                )

        # Serve the file with correct MIME type
        return FileResponse(
            video_path, media_type="video/mp4", filename=f"whiteboard_{paper_id}.mp4"
        )

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Download error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{paper_id}")
async def get_whiteboard_status(paper_id: str):
    """Get whiteboard video generation status"""
    try:
        if paper_id not in whiteboard_storage:
            return {"exists": False, "message": "No whiteboard video generated yet"}

        video_data = whiteboard_storage[paper_id]
        video_path = video_data.get("video_path")

        return {
            "exists": True,
            "has_video": video_path is not None and os.path.exists(video_path),
            "scenes_count": video_data.get("scenes_count"),
            "image_model": video_data.get("image_model"),
            "message": "Whiteboard video available",
        }

    except Exception as e:
        logging.error(f"❌ Status check error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{paper_id}")
async def delete_whiteboard_video(paper_id: str):
    """Delete whiteboard video and cleanup"""
    try:
        if paper_id not in whiteboard_storage:
            raise HTTPException(status_code=404, detail="Whiteboard video not found")

        video_data = whiteboard_storage[paper_id]

        # Cleanup video file
        video_path = video_data.get("video_path")
        if video_path and os.path.exists(video_path):
            os.remove(video_path)

        # Remove from storage
        del whiteboard_storage[paper_id]

        return {"success": True, "message": "Whiteboard video deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Deletion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
