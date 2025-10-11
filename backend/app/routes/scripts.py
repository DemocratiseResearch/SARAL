from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List
import os
import json
import traceback
import logging
from app.models.request_models import ScriptUpdateRequest, ScriptResponse, SectionScript, ScriptGenerationRequest
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
# from app.auth.dependencies import get_current_user  # Commented out for local use

router = APIRouter()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enhanced storage for scripts with bullet points
scripts_storage = {}

def ensure_scripts_directory():
    """Ensure scripts directory exists"""
    scripts_dir = "temp/scripts"
    os.makedirs(scripts_dir, exist_ok=True)
    return scripts_dir

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

def get_or_load_scripts(paper_id: str) -> Dict:
    """Get scripts from memory or load from file"""
    if paper_id not in scripts_storage:
        scripts_storage[paper_id] = load_scripts_from_file(paper_id)
    
    # Ensure proper structure
    if "sections" not in scripts_storage[paper_id]:
        scripts_storage[paper_id]["sections"] = {}
    
    return scripts_storage[paper_id]

@router.post("/{paper_id}/generate", response_model=ScriptResponse)
async def generate_script(
    paper_id: str, 
    request: ScriptGenerationRequest = None,
    api_keys: dict = Depends(get_api_keys)
):
    """Generate presentation script from paper with bullet points and complexity mode support."""
    # Get complexity mode from request or use default
    complexity_mode = "normal"
    if request and hasattr(request, 'complexity_mode'):
        complexity_mode = request.complexity_mode.value
    
    logger.info(f"Generating script for paper {paper_id} with complexity mode: {complexity_mode}")
    
    paper_id_str = str(paper_id)  # Ensure we're using a string for comparison
    
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

    try:
        # Check if this is a PDF-sourced file or LaTeX file
        source_type = paper_info.get("source_type", "latex")
        logger.info(f"Processing paper {paper_id_str} of source type {source_type}")
        
        # Get the path to the file (could be tex_file_path for LaTeX or text_file_path for PDF)
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
            logger.info(f"Using tex_file_path: {file_path}")
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
            logger.info(f"Using text_file_path: {file_path}")
        else:
            available_keys = list(paper_info.keys())
            logger.error(f"No text or tex file path found. Available keys: {available_keys}")
            raise ValueError(f"No text or tex file path found in paper info. Available keys: {available_keys}")
        
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
        
        # Generate full script using Gemini with improved prompts and complexity mode
        full_script = generate_full_script_with_gemini(
            api_keys["gemini_key"], 
            input_text,
            complexity_mode=complexity_mode
        )
        
        # Split into sections
        sections_scripts = split_script_into_sections(full_script)
        
        # Clean each section for TTS
        cleaned_sections = {}
        for section_name, script_text in sections_scripts.items():
            cleaned_sections[section_name] = clean_script_for_tts_and_video(script_text)
        
        # Generate bullet points for all sections with a single prompt and complexity mode
        logger.info(f"Generating bullet points for all sections using single prompt (complexity: {complexity_mode})")
        all_bullet_points = generate_all_bullet_points_with_gemini(
            api_keys["gemini_key"],
            cleaned_sections,
            complexity_mode=complexity_mode
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
            "title_intro_script": title_intro.strip()
        }
        
        scripts_storage[paper_id] = script_data
        
        # Save to file immediately
        if not save_scripts_to_file(paper_id, script_data):
            logger.warning(f"Failed to save scripts to file for paper {paper_id}")
        
        # Return only script text for compatibility
        sections_scripts_only = {k: v["script"] for k, v in sections_with_bullets.items()}
        
        return ScriptResponse(
            sections_scripts=sections_scripts_only,
            paper_id=paper_id
        )
        
    except Exception as e:
        logger.error(f"Error generating script: {str(e)}")
        logger.error(traceback.format_exc())
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
