from fastapi import APIRouter, HTTPException, Depends, Form, File, UploadFile, Query
from typing import Dict, List
import os
import json
import traceback
import logging
from pathlib import Path
import shutil
import logging
from datetime import datetime
from app.models.request_models import ScriptUpdateRequest, ScriptResponse, SectionScript
from app.services.script_generator import (
    generate_full_script_with_gemini,
    split_script_into_sections,
    clean_script_for_tts_and_video,
    generate_title_introduction,
    extract_text_from_file,
    clean_text,
    generate_bullet_points_with_gemini,
    generate_all_bullet_points_with_gemini,
    extract_paper_metadata
)
from app.routes.papers import papers_storage
from app.routes.api_keys import get_api_keys
from app.services.storage_manager import storage_manager
from app.auth.dependencies import get_current_user

from app.services.patent_script_genrator import (
    generate_patent_script_with_gemini,
    split_script_into_sections as split_patent_script_into_sections,
    clean_script_for_tts_and_video as clean_patent_script,
    generate_patent_title_introduction,
    generate_all_bullet_points_with_gemini as generate_all_patent_bullets
)
from app.utils.timing import track_performance
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed
router = APIRouter()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enhanced storage for scripts with bullet points
scripts_storage = {}


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
        scripts_file = os.path.join(scripts_dir, f"{paper_id}_scripts.json")

        with open(scripts_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"Successfully saved scripts to {scripts_file}")
        return True
    except Exception as e:
        logger.error(f"Error saving scripts file: {str(e)}")
        return False


@track_performance
def get_or_load_scripts(paper_id: str) -> Dict:
    """Get scripts from memory or load from file"""
    if paper_id not in scripts_storage:
        scripts_storage[paper_id] = load_scripts_from_file(paper_id)

    # Ensure proper structure
    if "sections" not in scripts_storage[paper_id]:
        scripts_storage[paper_id]["sections"] = {}

    return scripts_storage[paper_id]

@router.post("/{paper_id}/generate", response_model=ScriptResponse)
async def generate_script(paper_id: str, audience_level: str = Query(None, description="Audience level: novice, intermediate, or expert"), api_keys: dict = Depends(get_api_keys)):
    """Generate presentation script from paper with bullet points."""
    paper_id_str = str(paper_id)  # Ensure we're using a string for comparison
    print("storage_manager", storage_manager)
    # Try to get from storage manager first
    paper_info = storage_manager.get_paper(paper_id_str)
    if not paper_info:
        # Fall back to in-memory storage
        if paper_id_str not in papers_storage:
            logger.error(f"Paper ID {paper_id_str} not found in storage. Available IDs: {list(papers_storage.keys())}")
            raise HTTPException(status_code=404, detail=f"Paper ID {paper_id_str} not found")
        paper_info = papers_storage[paper_id_str]
    
    if not api_keys.get("gemini_key"):
        raise HTTPException(status_code=400, detail="Gemini API key required")

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        update_pipeline_step(
            paper_id_str, "script_generation",
            metadata={"audience_level": audience_level, "source_type": paper_info.get("source_type", "unknown")},
            started_at=_step_started_at,
            status="in_progress",
        )

        # Check if this is a PDF-sourced file or LaTeX file
        source_type = paper_info.get("source_type", "latex")
        logger.info(f"Processing paper {paper_id_str} of source type {source_type}")
        if source_type == "patent":
            print("scripts generation for patent")
            file_path = paper_info.get("text_file_path")
            if not file_path:
                raise ValueError("No text_file_path found for the patent.")
            
            input_text = extract_text_from_file(file_path)
            full_script = generate_patent_script_with_gemini(api_keys["gemini_key"], input_text)
            sections_scripts = split_patent_script_into_sections(full_script)
            
            cleaned_sections = {name: clean_patent_script(script) for name, script in sections_scripts.items()}
            all_bullet_points = generate_all_patent_bullets(api_keys["gemini_key"], cleaned_sections, audience_level=audience_level)

            metadata = paper_info["metadata"]
            title_intro = generate_patent_title_introduction(
                metadata.get("title", "Invention Title"),
                metadata.get("patent_id", "Not Found"),
                metadata.get("inventors", "Inventor(s)"),
                metadata.get("assignee", "Assignee"),
                metadata.get("publication_date", "Date")
            )
        else:
            print("script generation for pdf or latex or arxiv")
            # Get the path to the file (could be tex_file_path for LaTeX or text_file_path for PDF)
            file_path = None

            #LATEX uploaded papers
            if "tex_file_path" in paper_info:
                file_path = paper_info["tex_file_path"]
                logger.info(f"Using tex_file_path: {file_path}")

            # PDF papers
            elif "text_file_path" in paper_info:
                file_path = paper_info["text_file_path"]
                logger.info(f"Using text_file_path: {file_path}")

            #  ARXIV papers
            else:
                arxiv_root = "temp/arxiv_sources"
                if os.path.exists(arxiv_root):
                    for folder in os.listdir(arxiv_root):
                        source_dir = os.path.join(arxiv_root, folder, "source")
                        if os.path.exists(source_dir):
                            for f in os.listdir(source_dir):
                                if f.endswith(".tex"):
                                    file_path = os.path.join(source_dir, f)
                                    logger.info(f"Using arxiv tex file: {file_path}")
                                    break
                        if file_path:
                            break
                if not file_path:
                    raise ValueError("No text or tex file found for this paper")
            
            # Use the same metadata that's stored in paper_info for consistency
            # This ensures that the title intro script uses the same metadata as the slides
            metadata = paper_info["metadata"]
            title_intro = generate_title_introduction(
                metadata.get("title", "Research Paper"),
                metadata.get("authors", "Author"),
                metadata.get("date", "2024")
            )
            print(f"Generated title introduction: {title_intro}")
            input_text = extract_text_from_file(file_path)
            input_text = clean_text(input_text)
        
            # Generate full script using Gemini with improved prompts
            full_script = generate_full_script_with_gemini(api_keys["gemini_key"], input_text, audience_level=audience_level)
            
            print("full_script from gemini", full_script)
            # Split into sections
            sections_scripts = split_script_into_sections(full_script)
        
            # Clean each section for TTS
            cleaned_sections = {}
            for section_name, script_text in sections_scripts.items():
                cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)
        
            # Generate bullet points for all sections with a single prompt
            logger.info(f"Generating bullet points for all sections using single prompt")
            all_bullet_points = generate_all_bullet_points_with_gemini(
                api_keys["gemini_key"],
                cleaned_sections,
                audience_level=audience_level
            )
            logger.info(f"Generated bullet points for {len(all_bullet_points)} sections")
        
        # Combine cleaned scripts with bullet points
        sections_with_bullets = {}
        for section_name in cleaned_sections.keys():
            sections_with_bullets[section_name] = {
                "script": cleaned_sections[section_name],
                "bullet_points": all_bullet_points.get(section_name, ["Key information from this section"]),
                "assigned_image": None
            }
        
        # Store comprehensive script data
        script_data = {
            "sections": sections_with_bullets,
            "full_script": full_script,
            "status": "generated",
            "source_type": source_type,
            "title_intro_script": title_intro.strip(),
            "audience_level": audience_level
        }
        
        scripts_storage[paper_id] = script_data
        
        # Save to file immediately
        if not save_scripts_to_file(paper_id, script_data):
            logger.warning(f"Failed to save scripts to file for paper {paper_id}")

        # Record successful pipeline step in Firestore
        update_pipeline_step(
            paper_id_str,
            "script_generation",
            metadata={
                "audience_level": audience_level,
                "source_type": source_type,
                "language": paper_info.get("language", "English"),
                "sections_count": len(sections_with_bullets),
            },
            started_at=_step_started_at,
            status="completed",
        )

        # Return only script text for compatibility
        sections_scripts_only = {k: v["script"] for k, v in sections_with_bullets.items()}
        
        return ScriptResponse(
            sections_scripts=sections_scripts_only,
            paper_id=paper_id
        )
        
    except Exception as e:
        logger.error(f"Error generating script: {str(e)}")
        logger.error(traceback.format_exc())
        mark_pipeline_failed(paper_id_str, "script_generation", e, started_at=_step_started_at)
        raise HTTPException(status_code=500, detail=f"Error generating script: {str(e)}")

@router.get("/{paper_id}/sections")
async def get_sections_with_bullets(paper_id: str):
    """Get all section scripts with bullet points."""
    try:
        script_data = get_or_load_scripts(paper_id)
        
        if not script_data or not script_data.get("sections"):
            raise HTTPException(status_code=404, detail="Scripts not found for this paper")
        
        return {
            "sections": script_data["sections"],
            "paper_id": paper_id,
            "status": script_data.get("status", "unknown")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sections: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading scripts: {str(e)}")

@router.put("/{paper_id}/sections")
async def update_sections(paper_id: str, request: ScriptUpdateRequest):
    """Update section scripts and bullet points."""
    try:
        # Get or load existing scripts
        script_data = get_or_load_scripts(paper_id)
        
        if not request.sections:
            return {
                "message": "No sections to update",
                "paper_id": paper_id,
                "sections": script_data.get("sections", {})
            }
        
        # Update sections
        updated_sections = {}
        for section_name, section_data in request.sections.items():
            # Initialize section if it doesn't exist
            if section_name not in script_data["sections"]:
                script_data["sections"][section_name] = {
                    "script": "",
                    "bullet_points": [],
                    "assigned_image": None
                }
            
            current_section = script_data["sections"][section_name]
            
            # Handle both dict and SectionScript objects
            if isinstance(section_data, dict):
                if "script" in section_data:
                    current_section["script"] = section_data["script"]
                if "bullet_points" in section_data:
                    current_section["bullet_points"] = section_data["bullet_points"]
                # Don't update assigned_image here - handled separately
            else:
                # Handle SectionScript object
                current_section["script"] = section_data.script
                current_section["bullet_points"] = section_data.bullet_points or []
            
            updated_sections[section_name] = current_section.copy()
        
        # Save to memory and file
        scripts_storage[paper_id] = script_data
        
        if not save_scripts_to_file(paper_id, script_data):
            raise HTTPException(status_code=500, detail="Failed to save scripts to file")
        
        logger.info(f"Successfully updated sections: {list(updated_sections.keys())}")
        
        return {
            "message": "Scripts updated successfully",
            "updated_sections": list(request.sections.keys()),
            "sections": updated_sections,
            "paper_id": paper_id
        }

    except Exception as e:
        logger.error(f"Error updating scripts: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error updating scripts: {str(e)}")

@router.put("/{paper_id}/sections/{section_name}/image")
async def assign_image_to_section(paper_id: str, section_name: str, image_name: str = None):
    """Assign an image to a specific section."""
    try:
        script_data = get_or_load_scripts(paper_id)
        
        # Initialize section if it doesn't exist
        if section_name not in script_data["sections"]:
            script_data["sections"][section_name] = {
                "script": "",
                "bullet_points": [],
                "assigned_image": None
            }
        
        # Update image assignment
        script_data["sections"][section_name]["assigned_image"] = image_name
        
        # Save to memory and file
        scripts_storage[paper_id] = script_data
        
        if not save_scripts_to_file(paper_id, script_data):
            raise HTTPException(status_code=500, detail="Failed to save scripts to file")
        
        action = "assigned" if image_name else "removed"
        return {
            "message": f"Image {action} for {section_name}",
            "section_name": section_name,
            "image_name": image_name
        }
        
    except Exception as e:
        logger.error(f"Error assigning image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning image: {str(e)}")

@router.get("/{paper_id}/sections/refresh")
async def refresh_sections_data(paper_id: str):
    """Get fresh sections data after updates."""
    try:
        # Force reload from file
        script_data = load_scripts_from_file(paper_id)
        
        if not script_data:
            raise HTTPException(status_code=404, detail="Scripts not found")
        
        # Update memory storage
        scripts_storage[paper_id] = script_data
        
        return {
            "sections": script_data.get("sections", {}),
            "paper_id": paper_id,
            "status": script_data.get("status", "unknown")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing sections: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error refreshing scripts: {str(e)}")
    
@router.put("/sections/new_image")
async def assign_new_image_to_section(
    paper_id: str = Form(None),
    section_name: str = Form(None),
    image: UploadFile = File(...),
    # image_name: str = Form(None)
):
    """
    Assign an uploaded image to a specific section.
    - Saves the image under temp/papers/{paper_id}/source/images/
    - Updates papers_storage[paper_id]["image_files"]
    - Assigns the image to the section in scripts_storage
    """
    try:
        # Ensure script data is available
        script_data = get_or_load_scripts(paper_id)

        # Setup directories
        extract_dir = Path(f"temp/papers/{paper_id}/source")
        image_dir = extract_dir / "images"
        image_dir.mkdir(parents=True, exist_ok=True)

        # Define image name and path
        image_name = image.filename
        image_path = image_dir / image_name
        print("image_path", image_path)
        #  Save uploaded image to disk
        with open(image_path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        logger.info(f"Saved image: {image_path}")

        #  Ensure paper info exists
        if paper_id not in papers_storage:
            papers_storage[paper_id] = {"image_files": []}

        print("papers_storage", papers_storage[paper_id])
        #  Add image to papers_storage
        if "image_files" not in papers_storage[paper_id]:
            papers_storage[paper_id]["image_files"] = []
        papers_storage[paper_id]["image_files"].append(str(image_path))

        print("papers_storage2345", papers_storage[paper_id])
        #  Initialize section if not exists
        if section_name not in script_data["sections"]:
            script_data["sections"][section_name] = {
                "script": "",
                "bullet_points": [],
                "assigned_image": None
            }

        #  Assign image to section
        script_data["sections"][section_name]["assigned_image"] = image_name

        # Update global storage and save to file
        scripts_storage[paper_id] = script_data
        if not save_scripts_to_file(paper_id, script_data):
            raise HTTPException(status_code=500, detail="Failed to save scripts to file")

        return {
            "message": f"Image '{image_name}' assigned to section '{section_name}'",
            "paper_id": paper_id,
            "section_name": section_name,
            "image_name": image_name,
            "saved_path": str(image_path)
        }

    except Exception as e:
        logger.error(f"Error assigning image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error assigning image: {str(e)}")