from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
import os
import shutil
from app.auth.dependencies import get_current_user
from app.models.request_models import SlideResponse, SlideGenerationRequest
from app.routes.papers import papers_storage
from app.routes.scripts import scripts_storage
from app.services.beamer_generator import create_beamer_presentation
from app.services.powerpoint_generator import create_powerpoint_presentation, copy_paper_images_for_pptx
from app.utils.latex_to_images import compile_latex, convert_pdf_to_images

router = APIRouter()

# In-memory storage for slides
slides_storage = {}

@router.post("/{paper_id}/generate", response_model=SlideResponse)
async def generate_slides(paper_id: str, request: SlideGenerationRequest = SlideGenerationRequest()):
    """Generate slides from scripts with bullet points in specified format."""
    
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    if paper_id not in scripts_storage:
        # Try to load scripts from file
        scripts_file = f"temp/scripts/{paper_id}_scripts.json"
        if os.path.exists(scripts_file):
            import json
            with open(scripts_file, 'r', encoding='utf-8') as f:
                scripts_storage[paper_id] = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="Scripts not generated yet")
    
    try:
        paper_info = papers_storage[paper_id]
        scripts_info = scripts_storage[paper_id]
        
        # Create output directory
        output_dir = f"temp/slides/{paper_id}"
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Get image assignments
        image_assignments = {}
        for section_name, section_data in scripts_info.get("sections", {}).items():
            if section_data.get("assigned_image"):
                image_assignments[section_name] = section_data["assigned_image"]
        
        if request.format.lower() == "powerpoint":
            # Generate PowerPoint presentation
            return await generate_powerpoint_slides(paper_id, paper_info, scripts_info, image_assignments, output_dir)
        else:
            # Generate Beamer presentation (default)
            return await generate_beamer_slides(paper_id, paper_info, scripts_info, image_assignments, output_dir)
        
    except Exception as e:
        print(f"Error generating slides: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating slides: {str(e)}")

async def generate_beamer_slides(paper_id: str, paper_info: dict, scripts_info: dict, image_assignments: dict, output_dir: str):
    """Generate Beamer slides."""
    # Copy theme files to output directory
    copy_beamer_theme_files(output_dir)
    
    # Copy images to output directory
    copy_paper_images(paper_info.get("image_files", []), output_dir)
    
    # Create Beamer presentation with bullet points
    latex_file = create_beamer_presentation(
        paper_id,
        scripts_info,
        paper_info["metadata"],
        image_assignments
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
        "format": "beamer"
    }
    
    return SlideResponse(
        pdf_path=pdf_path,
        image_paths=[f"/api/slides/{paper_id}/{os.path.basename(p)}" for p in image_paths],
        paper_id=paper_id,
        format="beamer"
    )

async def generate_powerpoint_slides(paper_id: str, paper_info: dict, scripts_info: dict, image_assignments: dict, output_dir: str):
    """Generate PowerPoint slides."""
    # Copy images to output directory for PowerPoint
    copy_paper_images_for_pptx(paper_info.get("image_files", []), paper_id)
    
    # Create PowerPoint presentation
    pptx_file = create_powerpoint_presentation(
        paper_id,
        scripts_info,
        paper_info["metadata"],
        image_assignments
    )
    
    if not pptx_file or not os.path.exists(pptx_file):
        raise Exception("Failed to create PowerPoint presentation")
    
    # For PowerPoint, we don't convert to images by default, but we can create thumbnails
    image_paths = []
    
    # Store slide info
    slides_storage[paper_id] = {
        "pptx_path": pptx_file,
        "image_paths": image_paths,
        "output_dir": output_dir,
        "status": "generated",
        "format": "powerpoint"
    }
    
    return SlideResponse(
        pptx_path=pptx_file,
        image_paths=image_paths,
        paper_id=paper_id,
        format="powerpoint"
    )

def copy_beamer_theme_files(output_dir: str):
    """Copy Beamer theme files to output directory."""
    theme_files = [
        'beamerthemeSimpleDarkBlue.sty',
        'beamerfontthemeSimpleDarkBlue.sty',
        'beamercolorthemeSimpleDarkBlue.sty',
        'beamerinnerthemeSimpleDarkBlue.sty'
    ]
    
    # Look for theme files in various locations
    theme_paths = [
        'temp/latex_template',
        'latex_template',
        '../latex_template'
    ]
    
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
        pdf_path,
        media_type='application/pdf',
        filename=f"slides_{paper_id}.pdf"
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
        latex_path,
        media_type='text/plain',
        filename=f"slides_{paper_id}.tex"
    )

@router.get("/{paper_id}/download-pptx")
async def download_powerpoint(paper_id: str):
    """Download the PowerPoint presentation file."""
    
    if paper_id not in slides_storage:
        raise HTTPException(status_code=404, detail="Slides not generated yet")
    
    slides_info = slides_storage[paper_id]
    pptx_path = slides_info.get("pptx_path")
    
    if not pptx_path or not os.path.exists(pptx_path):
        raise HTTPException(status_code=404, detail="PowerPoint file not found")
    
    return FileResponse(
        pptx_path,
        media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',
        filename=f"slides_{paper_id}.pptx"
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
                if file.lower().endswith(('.png', '.jpg', '.jpeg')):
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
                            image_path,
                            media_type='image/png',
                            filename=image_name
                        )
    
    # Fallback: look in the slides directory
    image_path = f"temp/slides/{paper_id}/{image_name}"
    
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine media type based on file extension
    media_type = 'image/png'
    if image_name.lower().endswith('.jpg') or image_name.lower().endswith('.jpeg'):
        media_type = 'image/jpeg'
    elif image_name.lower().endswith('.gif'):
        media_type = 'image/gif'
    
    return FileResponse(
        image_path,
        media_type=media_type,
        filename=image_name
    )
