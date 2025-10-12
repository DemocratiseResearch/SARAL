from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import json
from pathlib import Path

from ..services.manim_service import ManimService
from ..routes.api_keys import get_api_keys
from ..routes.scripts import (
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
import logging

router = APIRouter()

# Configure logging
logger = logging.getLogger(__name__)


# Configure logging
logger = logging.getLogger(__name__)


class ManimGenerationRequest(BaseModel):
    paper_id: str
    audio_file: Optional[str] = None
    tts_provider: str = "kokoro"  # "kokoro", "bhashini", or "sarvam"
    tts_gender: str = "female"  # For Bhashini: "male" or "female"
    tts_language: str = (
        "english"  # For Bhashini: "english", "hindi", "gujarati", "marathi", "telugu"
    )


class ManimResponse(BaseModel):
    video_path: Optional[str]
    manim_code: Optional[str]
    narration: Optional[str]
    success: bool
    message: str


# In-memory storage for manim data
manim_storage = {}


async def auto_generate_scripts_if_needed(paper_id: str, gemini_api_key: str) -> dict:
    """Auto-generate scripts if they don't exist for the paper"""
    try:
        logger.info(f"🔄 Auto-generating scripts for paper {paper_id}")

        # Get paper info
        paper_info = None
        if paper_id in papers_storage:
            paper_info = papers_storage[paper_id]
            logger.info(f"✅ Found paper {paper_id} in memory storage")
        else:
            # Try to load from storage manager
            from ..services.storage_manager import storage_manager

            paper_info = storage_manager.get_paper(paper_id)
            if paper_info:
                logger.info(f"✅ Found paper {paper_id} in storage manager")

        if not paper_info:
            # Debug: Show available papers
            logger.error(f"❌ Paper {paper_id} not found in storage")
            logger.error(
                f"📋 Available papers in memory: {list(papers_storage.keys())}"
            )
            from ..services.storage_manager import storage_manager

            all_papers = storage_manager.get_all_papers()
            logger.error(f"📋 Available papers in disk: {list(all_papers.keys())}")

            # Check if any paper has this arxiv_id
            for uuid, info in all_papers.items():
                arxiv_id = info.get("metadata", {}).get("arxiv_id")
                if arxiv_id:
                    logger.info(f"   Paper {uuid} has arxiv_id: {arxiv_id}")

            return {}

        # Get file path
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
        else:
            logger.error(f"No file path found for paper {paper_id}")
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
        logger.info("Generating full script with Gemini...")
        full_script = generate_full_script_with_gemini(gemini_api_key, input_text)

        # Split into sections
        sections_scripts = split_script_into_sections(full_script)

        # Clean each section
        cleaned_sections = {}
        for section_name, script_text in sections_scripts.items():
            cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)

        # Generate bullet points
        logger.info("Generating bullet points...")
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

        logger.info(f"Successfully auto-generated scripts for paper {paper_id}")
        return script_data

    except Exception as e:
        logger.error(f"Error auto-generating scripts: {str(e)}", exc_info=True)
        return {}


@router.post("/generate/{paper_id}", response_model=ManimResponse)
async def generate_manim_video(
    paper_id: str,
    request: ManimGenerationRequest,
    api_keys: dict = Depends(get_api_keys),
):
    """Generate Manim animation from research paper"""
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(status_code=400, detail="Gemini API key required")

        # Resolve arxiv ID to UUID if needed
        resolved_id = resolve_paper_id(paper_id)
        print(
            f"Generating Manim animation for paper: {paper_id} (resolved to {resolved_id})"
        )
        print(f"Request data: {request}")

        # Check if paper exists before attempting to load/generate scripts
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

        # Load scripts data - auto-generate if not found
        if resolved_id in scripts_storage:
            scripts_data = scripts_storage[resolved_id]
        else:
            scripts_data = load_scripts_from_file(resolved_id)
            if not scripts_data:
                logger.info(f"Scripts not found for {resolved_id}, auto-generating...")
                scripts_data = await auto_generate_scripts_if_needed(
                    resolved_id, api_keys["gemini_key"]
                )

                if not scripts_data:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to generate scripts for {paper_id}. Please ensure the paper exists and try again.",
                    )

        print(f"Scripts data loaded: {bool(scripts_data)}")

        # Load metadata
        if resolved_id in papers_storage:
            metadata = papers_storage[resolved_id].get("metadata", {})
        else:
            metadata = {}
            metadata_file = f"temp/papers/{resolved_id}/metadata.json"
            if os.path.exists(metadata_file):
                with open(metadata_file, "r", encoding="utf-8") as f:
                    metadata = json.load(f)

        print(f"Metadata loaded: {metadata.get('title', 'No title')}")

        manim_service = ManimService(
            gemini_api_key=api_keys["gemini_key"],
            sarvam_api_key=api_keys.get("sarvam_key"),
        )

        manim_code, narration = manim_service.generate_manim_animation(
            resolved_id,
            scripts_data,
            metadata,  # Always 60 seconds internally
        )

        if not manim_code:
            return ManimResponse(
                video_path=None,
                manim_code=None,
                narration=None,
                success=False,
                message="Failed to generate Manim code",
            )

        print(f"Manim code generated: {len(manim_code)} characters")
        print(f"Generated code preview:\n{manim_code[:200]}...")

        # Create video with narration for TTS
        video_path = manim_service.create_video_from_code(
            resolved_id,
            manim_code,
            narration,
            request.audio_file,
            tts_provider=request.tts_provider,
            tts_gender=request.tts_gender,
            tts_language=request.tts_language,
        )

        # Always return success with the code, even if video creation fails
        manim_dir = Path(f"temp/manim/{resolved_id}")
        manim_dir.mkdir(parents=True, exist_ok=True)

        with open(manim_dir / "animation_code.py", "w", encoding="utf-8") as f:
            f.write(manim_code)

        with open(manim_dir / "narration.txt", "w", encoding="utf-8") as f:
            f.write(narration or "")

        manim_storage[resolved_id] = {
            "video_path": video_path,
            "manim_code": manim_code,
            "narration": narration,
        }

        if video_path:
            print(f"Video generated successfully: {video_path}")
            message = "Manim animation generated successfully"
            # Return downloadable URL instead of filesystem path
            video_url = f"/api/manim/download/{paper_id}"
        else:
            print("Code generated but video creation failed")
            message = "Manim code generated but video creation failed. You can download the code and run it manually."
            video_url = None

        return ManimResponse(
            video_path=video_url,  # Return URL instead of filesystem path
            manim_code=manim_code,
            narration=narration,
            success=True,  # Always true if we have code
            message=message,
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"Error generating Manim animation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating Manim animation: {str(e)}"
        )


@router.get("/download/{paper_id}")
async def download_manim_video(paper_id: str):
    """Download generated Manim video"""
    resolved_id = resolve_paper_id(paper_id)
    print(f"Download request for paper: {paper_id} (resolved to {resolved_id})")

    # Check in storage first
    if resolved_id in manim_storage and manim_storage[resolved_id].get("video_path"):
        video_path = manim_storage[resolved_id]["video_path"]
        print(f"Found video path in storage: {video_path}")
    else:
        print("Video not in storage, checking filesystem...")
        # Check file system with more patterns
        possible_paths = [
            # TODO, we can add a backup video here as a different kind of fallback
            f"temp/manim/{resolved_id}_final_manim_animation.mp4",
            f"temp/manim/{resolved_id}_manim_video_attempt_0.mp4",
            f"temp/manim/{resolved_id}_manim_video_attempt_1.mp4",
            f"temp/manim/{resolved_id}_manim_video_attempt_2.mp4",
            f"temp/manim/{resolved_id}_manim_video_attempt_3.mp4",
            f"temp/manim/{resolved_id}_manim_video.mp4",
        ]

        video_path = None
        for path in possible_paths:
            full_path = Path(path).resolve()
            print(f"Checking: {full_path}")
            if full_path.exists():
                video_path = str(full_path)
                print(f"Found video at: {video_path}")
                break

        if not video_path:
            print(f"No video found for paper {paper_id}")
            # List what files exist in the manim directory for debugging
            manim_dir = Path("temp/manim")
            if manim_dir.exists():
                existing_files = list(manim_dir.glob(f"{resolved_id}*"))
                print(f"Existing files for {resolved_id}: {existing_files}")
            raise HTTPException(status_code=404, detail="Manim video not found")

    # Verify file exists before serving
    if not os.path.exists(video_path):
        print(f"Video path exists in storage but file missing: {video_path}")
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    print(f"Serving video file: {video_path}")
    return FileResponse(
        video_path, media_type="video/mp4", filename=f"manim_animation_{paper_id}.mp4"
    )


@router.get("/code/{paper_id}")
async def get_manim_code(paper_id: str):
    """Get generated Manim code"""
    resolved_id = resolve_paper_id(paper_id)

    if resolved_id in manim_storage and manim_storage[resolved_id].get("manim_code"):
        code = manim_storage[resolved_id]["manim_code"]
    else:
        code_path = f"temp/manim/{resolved_id}/animation_code.py"
        if not os.path.exists(code_path):
            raise HTTPException(status_code=404, detail="Manim code not found")

        with open(code_path, "r", encoding="utf-8") as f:
            code = f.read()

    return {"manim_code": code}


@router.get("/narration/{paper_id}")
async def get_manim_narration(paper_id: str):
    """Get generated narration script"""
    resolved_id = resolve_paper_id(paper_id)

    if resolved_id in manim_storage and manim_storage[resolved_id].get("narration"):
        narration = manim_storage[resolved_id]["narration"]
    else:
        narration_path = f"temp/manim/{resolved_id}/narration.txt"
        if not os.path.exists(narration_path):
            raise HTTPException(status_code=404, detail="Narration not found")

        with open(narration_path, "r", encoding="utf-8") as f:
            narration = f.read()

    return {"narration": narration}
