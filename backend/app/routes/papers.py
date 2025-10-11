from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse, FileResponse
import os
import zipfile
import tempfile
import shutil
import uuid
import logging
from pathlib import Path
from app.models.request_models import ArxivRequest, PaperResponse, PaperMetadata
from app.services.arxiv_scraper import ArxivScraper
from app.services.script_generator import extract_paper_metadata
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from app.services.pdf_processor import process_pdf_file
from app.services.storage_manager import storage_manager
# from app.auth.dependencies import get_current_user  # Commented out for local use
# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Keep in-memory storage for backward compatibility, but use persistent storage as the primary source
papers_storage = storage_manager.get_all_papers()

# Helper function to save paper info to both memory and persistent storage
def save_paper_info(paper_id: str, info: dict):
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)

@router.post("/upload-zip", response_model=PaperResponse)
async def upload_zip_file(file: UploadFile = File(...)):  # Removed auth for local use
    """Upload and extract a ZIP file containing LaTeX source."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        # Save uploaded ZIP file
        zip_path = os.path.join(temp_dir, file.filename)
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Extract ZIP file
        extract_dir = os.path.join(temp_dir, "source")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Find main .tex file
        tex_file_path = find_tex_file(extract_dir)
        
        # Extract metadata
        metadata = extract_paper_metadata(tex_file_path)
        
        # Find images
        image_refs = find_image_references(tex_file_path)
        image_files = find_image_files(extract_dir, image_refs)
        
        # Store paper info
        paper_info = {
            "metadata": metadata,
            "tex_file_path": tex_file_path,
            "source_dir": extract_dir,
            "image_files": image_files,
            "zip_file_path": zip_path,  # Store original ZIP path
            "status": "processed",
            "source_type": "latex"
        }
        save_paper_info(paper_id, paper_info)
        
        logger.info(f"Processed ZIP file for paper {paper_id}")
        
        return PaperResponse(
            paper_id=paper_id,
            metadata=PaperMetadata(**metadata),
            image_files=[os.path.basename(f) for f in image_files],
            tex_file_path=tex_file_path,
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error processing ZIP file: {str(e)}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing ZIP file: {str(e)}")

@router.post("/scrape-arxiv", response_model=PaperResponse)
async def scrape_arxiv(request: ArxivRequest):
    """Scrape LaTeX source from arXiv URL."""
    scraper = ArxivScraper()
    paper_id = str(uuid.uuid4())
    
    try:
        # Download and extract source
        extracted_dir = scraper.download_source(request.arxiv_url)
        
        # Get metadata from arXiv page
        arxiv_metadata = scraper.get_paper_metadata(request.arxiv_url)
        
        # Find main .tex file
        tex_file_path = find_tex_file(extracted_dir)
        
        # Extract metadata from LaTeX file and merge with arXiv metadata
        latex_metadata = extract_paper_metadata(tex_file_path)
        metadata = {**latex_metadata, **arxiv_metadata}
        metadata["arxiv_id"] = scraper.extract_arxiv_id(request.arxiv_url)
        
        # Find images
        image_refs = find_image_references(tex_file_path)
        image_files = find_image_files(extracted_dir, image_refs)
        
        # Store paper info
        paper_info = {
            "metadata": metadata,
            "tex_file_path": tex_file_path,
            "source_dir": extracted_dir,
            "image_files": image_files,
            "arxiv_url": request.arxiv_url,  # Store arXiv URL
            "status": "processed",
            "source_type": "arxiv"
        }
        save_paper_info(paper_id, paper_info)
        
        logger.info(f"Processed arXiv paper {paper_id}")
        
        return PaperResponse(
            paper_id=paper_id,
            metadata=PaperMetadata(**metadata),
            image_files=[os.path.basename(f) for f in image_files],
            tex_file_path=tex_file_path,
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error scraping arXiv: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scraping arXiv: {str(e)}")

@router.get("/{paper_id}/download-source")
async def download_paper_source(paper_id: str):
    """Download the original paper source (ZIP or raw files)."""
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paper_info = papers_storage[paper_id]
    
    # If we have the original ZIP file, return it
    if "zip_file_path" in paper_info and os.path.exists(paper_info["zip_file_path"]):
        return FileResponse(
            paper_info["zip_file_path"],
            media_type='application/zip',
            filename=f"paper_{paper_id}_source.zip"
        )
    
    # Otherwise, create a ZIP from the source directory
    source_dir = paper_info["source_dir"]
    if not os.path.exists(source_dir):
        raise HTTPException(status_code=404, detail="Source files not found")
    
    # Create temporary ZIP
    temp_zip = f"temp/downloads/paper_{paper_id}_source.zip"
    os.makedirs(os.path.dirname(temp_zip), exist_ok=True)
    
    try:
        with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(source_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arc_name = os.path.relpath(file_path, source_dir)
                    zipf.write(file_path, arc_name)
        
        return FileResponse(
            temp_zip,
            media_type='application/zip',
            filename=f"paper_{paper_id}_source.zip"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating source ZIP: {str(e)}")

@router.get("/{paper_id}/download-pdf")
async def download_paper_pdf(paper_id: str):
    """Download the original research paper PDF if available."""
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paper_info = papers_storage[paper_id]
    
    # Look for PDF in source directory
    source_dir = paper_info["source_dir"]
    pdf_files = []
    
    for root, dirs, files in os.walk(source_dir):
        for file in files:
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
    
    if pdf_files:
        # Return the first PDF found
        pdf_path = pdf_files[0]
        return FileResponse(
            pdf_path,
            media_type='application/pdf',
            filename=f"paper_{paper_id}.pdf"
        )
    
    # If no PDF in source, try to download from arXiv if available
    if "arxiv_url" in paper_info:
        try:
            import requests
            arxiv_id = paper_info["metadata"].get("arxiv_id")
            if arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                response = requests.get(pdf_url, stream=True)
                response.raise_for_status()
                
                # Save PDF temporarily
                temp_pdf = f"temp/downloads/paper_{paper_id}.pdf"
                os.makedirs(os.path.dirname(temp_pdf), exist_ok=True)
                
                with open(temp_pdf, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                return FileResponse(
                    temp_pdf,
                    media_type='application/pdf',
                    filename=f"paper_{paper_id}.pdf"
                )
        except Exception as e:
            print(f"Error downloading PDF from arXiv: {e}")
    
    raise HTTPException(status_code=404, detail="PDF not found for this paper")

@router.get("/{paper_id}/metadata", response_model=PaperMetadata)
async def get_metadata(paper_id: str):
    """Get paper metadata."""
    # Try to get from storage manager first
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info:
        # Fall back to in-memory storage
        if paper_id not in papers_storage:
            raise HTTPException(status_code=404, detail="Paper not found")
        paper_info = papers_storage[paper_id]
    
    metadata = paper_info["metadata"]
    return PaperMetadata(**metadata)

@router.put("/{paper_id}/metadata", response_model=PaperMetadata)
async def update_metadata(paper_id: str, metadata: PaperMetadata):
    """Update paper metadata."""
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    papers_storage[paper_id]["metadata"] = metadata.dict()
    return metadata

@router.post("/upload-pdf", response_model=PaperResponse)
async def upload_pdf_file(file: UploadFile = File(...)):
    """Upload and process a PDF file of a research paper."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        # Save uploaded PDF file
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process the PDF file
        result = process_pdf_file(pdf_path, paper_id)
        
        # Store paper info - result now contains tex_file_path for compatibility
        result["source_type"] = "pdf"  # Add source type
        save_paper_info(paper_id, result)
        
        # Log the storage info for debugging
        logger.info(f"Paper {paper_id} processed and stored with keys: {list(result.keys())}")
        
        return PaperResponse(
            paper_id=paper_id,
            metadata=PaperMetadata(**result["metadata"]),
            image_files=[os.path.basename(f) for f in result["image_files"]],
            tex_file_path=result["tex_file_path"],  # This should now be available
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error processing PDF file: {str(e)}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")

@router.get("/debug/storage")
async def debug_paper_storage():
    """Debug endpoint to check papers_storage content."""
    # Return a safe version of papers_storage (without full text content)
    debug_storage = {}
    for paper_id, paper_info in papers_storage.items():
        debug_storage[paper_id] = {
            "metadata": paper_info.get("metadata", {}),
            "has_tex_file": "tex_file_path" in paper_info,
            "has_text_file": "text_file_path" in paper_info,
            "source_type": paper_info.get("source_type", "unknown"),
            "status": paper_info.get("status", "unknown"),
            "image_count": len(paper_info.get("image_files", [])),
        }
    
    return debug_storage
