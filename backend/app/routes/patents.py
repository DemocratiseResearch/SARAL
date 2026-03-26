from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from app.models.request_models import PatentMetadata, PatentResponse
from app.services.storage_manager import storage_manager
from app.auth.dependencies import get_current_user
from app.routes.api_keys import get_api_keys
from app.services.pdf_processor import process_pdf_file
import logging
import uuid
import os
import shutil
from app.utils.timing import track_performance

# Configure logging
logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory storage for backward compatibility
papers_storage = storage_manager.get_all_papers()

@track_performance
def save_document_info(doc_id: str, info: dict):
    """Helper to save info to both memory and persistent storage."""
    papers_storage[doc_id] = info
    storage_manager.save_paper(doc_id, info)

@router.post("/upload-pdf", response_model=PatentResponse)
async def upload_patent_pdf(
    file: UploadFile = File(...), 
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process a PDF file of a patent."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/patents/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")

        result = await process_pdf_file(pdf_path, paper_id, "patent", gemini_api_key=gemini_api_key)
        #result = await process_pdf_file(pdf_path, paper_id)
        
        result["source_type"] = "patent"
        save_document_info(paper_id, result)
        
        logger.info(f"Patent {paper_id} processed and stored with keys: {list(result.keys())}")
        
        return PatentResponse(
            paper_id=paper_id,
            metadata=PatentMetadata(**result["metadata"]),
            image_files=[os.path.basename(f) for f in result["image_files"]],
            text_file_path=result["text_file_path"],
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error processing PDF file: {str(e)}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")


@router.get("/{paper_id}/metadata", response_model=PatentMetadata)
async def get_patent_metadata(paper_id: str):
    """Get patent metadata."""
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info or paper_info.get("source_type") != "patent":
        raise HTTPException(status_code=404, detail="Patent not found")
    
    metadata = paper_info.get("metadata", {})
    return PatentMetadata(**metadata)

@router.put("/{paper_id}/metadata", response_model=PatentMetadata)
async def update_patent_metadata(paper_id: str, metadata: PatentMetadata, current_user: dict = Depends(get_current_user)):
    """Update patent metadata."""
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info or paper_info.get("source_type") != "patent":
        raise HTTPException(status_code=404, detail="Patent not found")

    paper_info["metadata"] = metadata.dict()
    save_document_info(paper_id, paper_info)
    
    logger.info(f"Updated metadata for patent {paper_id}")
    return metadata
