from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Optional
import os
import shutil
from app.auth.dependencies import get_current_user
from app.models.request_models import SlideResponse
from app.routes.papers import papers_storage
from app.routes.scripts import (
    scripts_storage,
    load_scripts_from_file,
    resolve_paper_id,
    save_scripts_to_file,
)
from app.services.beamer_generator import create_beamer_presentation
from app.utils.latex_to_images import compile_latex, convert_pdf_to_images
from app.services.script_generator import (
    generate_full_script_with_gemini,
    split_script_into_sections,
    clean_script_for_tts_and_video,
    generate_title_introduction,
    extract_text_from_file,
    clean_text,
    generate_all_bullet_points_with_gemini,
)
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory storage for slides
slides_storage = {}


async def auto_generate_scripts_if_needed(
    paper_id: str, gemini_api_key: Optional[str] = None
) -> dict:
    """Auto-generate scripts if they don't exist for the paper"""
    try:
        logger.info(f"🔄 Auto-generating scripts for paper {paper_id}")

        # Get Gemini API key from environment if not provided
        if not gemini_api_key:
            gemini_api_key = os.getenv("GEMINI_API_KEY")
            if not gemini_api_key:
                logger.error("❌ Gemini API key not available")
                return {}

        # Get paper info
        paper_info = None
        if paper_id in papers_storage:
            paper_info = papers_storage[paper_id]
        else:
            # Try to load from storage manager
            from app.services.storage_manager import storage_manager

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


@router.post("/{paper_id}/generate", response_model=SlideResponse)
async def generate_slides(paper_id: str):
    """Generate slides from scripts with bullet points."""

    if paper_id not in papers_storage:
        # Check storage manager too
        from app.services.storage_manager import storage_manager

        if not storage_manager.get_paper(paper_id):
            raise HTTPException(
                status_code=404,
                detail=f"Paper {paper_id} not found. Please upload the paper first at /papers/upload or search for it.",
            )

    if paper_id not in scripts_storage:
        scripts_data = load_scripts_from_file(paper_id)
        if not scripts_data:
            logger.info(f"🔄 Scripts not found for {paper_id}, auto-generating...")
            scripts_data = await auto_generate_scripts_if_needed(paper_id)

            if not scripts_data:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate scripts for {paper_id}. Please ensure the paper exists and try again.",
                )

        scripts_storage[paper_id] = scripts_data

    try:
        paper_info = papers_storage[paper_id]
        scripts_info = scripts_storage[paper_id]

        # Create output directory
        output_dir = f"temp/slides/{paper_id}"
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # Copy theme files to output directory
        copy_beamer_theme_files(output_dir)

        # Copy images to output directory
        copy_paper_images(paper_info.get("image_files", []), output_dir)

        # Get image assignments
        image_assignments = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if section_data.get("assigned_image"):
                image_assignments[section_name] = section_data["assigned_image"]

        # Create Beamer presentation with bullet points
        latex_file = create_beamer_presentation(
            paper_id, scripts_info, paper_info["metadata"], image_assignments
        )

        # Copy LaTeX file to output directory
        output_latex = os.path.join(output_dir, f"{paper_id}_presentation.tex")
        shutil.copy2(latex_file, output_latex)

        # Compile LaTeX to PDF
        pdf_path = compile_latex(output_latex, output_dir)

        if not pdf_path:
            raise Exception("Failed to compile LaTeX to PDF")

        # Convert PDF to images
        image_paths = convert_pdf_to_images(pdf_path, output_dir, dpi=300)

        if not image_paths:
            raise Exception("Failed to convert PDF to images")

        # Store slide info
        slides_storage[paper_id] = {
            "pdf_path": pdf_path,
            "image_paths": image_paths,
            "latex_path": output_latex,
            "output_dir": output_dir,
            "status": "generated",
        }

        return SlideResponse(
            pdf_path=pdf_path,
            image_paths=[
                f"/api/slides/{paper_id}/{os.path.basename(p)}" for p in image_paths
            ],
            paper_id=paper_id,
        )

    except Exception as e:
        print(f"Error generating slides: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating slides: {str(e)}"
        )


def copy_beamer_theme_files(output_dir: str):
    """Copy Beamer theme files to output directory."""
    theme_files = [
        "beamerthemeSimpleDarkBlue.sty",
        "beamerfontthemeSimpleDarkBlue.sty",
        "beamercolorthemeSimpleDarkBlue.sty",
        "beamerinnerthemeSimpleDarkBlue.sty",
    ]

    # Look for theme files in various locations
    theme_paths = ["temp/latex_template", "latex_template", "../latex_template"]

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


@router.get("/{paper_id}/download")
async def download_pdf(paper_id: str):
    """Download the generated PDF."""

    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not found")

    pdf_path = slides_storage[paper_id]["pdf_path"]

    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        pdf_path, media_type="application/pdf", filename=f"slides_{paper_id}.pdf"
    )


@router.get("/{paper_id}/download-latex")
async def download_latex_source(paper_id: str):
    """Download the LaTeX source code for slides."""

    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not generated yet")

    slides_info = slides_storage[paper_id]
    latex_path = slides_info.get("latex_path")

    if not latex_path or not os.path.exists(latex_path):
        raise HTTPException(status_code=404, detail="LaTeX source file not found")

    return FileResponse(
        latex_path, media_type="text/plain", filename=f"slides_{paper_id}.tex"
    )


@router.get("/{paper_id}/preview")
async def preview_slides(paper_id: str):
    """Return URLs of generated slide images for preview."""

    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not generated yet")

    slides_info = slides_storage[paper_id]

    # Get the actual generated slide images
    slide_images = []
    if "image_paths" in slides_info:
        slide_images = [os.path.basename(path) for path in slides_info["image_paths"]]

    # Alternative: scan the directory if image_paths is not available
    if not slide_images:
        slides_dir = f"temp/slides/{paper_id}"
        if os.path.exists(slides_dir):
            for file in os.listdir(slides_dir):
                if file.lower().endswith((".png", ".jpg", ".jpeg")):
                    slide_images.append(file)

    return {"images": slide_images}


@router.get("/{paper_id}/{image_name}")
async def get_slide_image(paper_id: str, image_name: str):
    """Serve individual slide images."""

    # Security check: ensure image_name doesn't contain path traversal
    if ".." in image_name or "/" in image_name or "\\" in image_name:
        raise HTTPException(status_code=400, detail="Invalid image name")

    # Try to get from slides storage first
    if paper_id in slides_storage:
        slides_info = slides_storage[paper_id]
        if "image_paths" in slides_info:
            for image_path in slides_info["image_paths"]:
                if os.path.basename(image_path) == image_name:
                    if os.path.exists(image_path):
                        return FileResponse(
                            image_path, media_type="image/png", filename=image_name
                        )

    # Fallback: look in the slides directory
    image_path = f"temp/slides/{paper_id}/{image_name}"

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    # Determine media type based on file extension
    media_type = "image/png"
    if image_name.lower().endswith(".jpg") or image_name.lower().endswith(".jpeg"):
        media_type = "image/jpeg"
    elif image_name.lower().endswith(".gif"):
        media_type = "image/gif"

    return FileResponse(image_path, media_type=media_type, filename=image_name)
