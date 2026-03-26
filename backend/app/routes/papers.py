from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Depends, Request, Form
from fastapi.responses import JSONResponse, FileResponse
import os
import zipfile
import tempfile
import shutil
import uuid
import logging
from pathlib import Path
from app.models.request_models import ArxivRequest, PaperResponse, PaperMetadata, PatentResponse, PatentMetadata
from app.services.arxiv_scraper import ArxivScraper
from app.services.script_generator import extract_paper_metadata
from app.services.latex_processor import find_tex_file, find_image_references, find_image_files
from app.services.storage_manager import storage_manager
from app.auth.dependencies import get_current_user
from app.routes.api_keys import get_api_keys
from app.services.metadata_tracker import track_paper_upload, track_output_generation
from app.services.firestore_helpers import init_pipeline_tracking
from app.middleware.session_tracking import get_user_context
from arq import create_pool
from arq.connections import RedisSettings
import base64
import io
from fastapi.datastructures import Headers
import asyncio
from  patchright.async_api import async_playwright 
import time
from app.utils.timing import track_performance

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()


import threading
from typing import Dict
# import asyncio
from concurrent.futures import ThreadPoolExecutor
# Thread-safe job tracking
job_status_lock = threading.Lock()
job_status: Dict[str, dict] = {}

# Thread pool for CPU-intensive operations (optional)
thread_pool = ThreadPoolExecutor(max_workers=10)
# Semaphore to limit concurrent processing (prevents CPU overload)
# Adjust max_concurrent based on your CPU cores (2-4 for most systems)
max_concurrent_jobs = 15  # Process max 3 videos simultaneously
processing_semaphore = asyncio.Semaphore(max_concurrent_jobs)


# Keep in-memory storage for backward compatibility, but use persistent storage as the primary source
papers_storage = storage_manager.get_all_papers()

# Helper function to save paper info to both memory and persistent storage
@track_performance
def save_paper_info(paper_id: str, info: dict):
    papers_storage[paper_id] = info
    storage_manager.save_paper(paper_id, info)

@track_performance
async def download_biorxiv_paper(url, paper_id) -> UploadFile:
    if not url.startswith("http"):
        url = "https://" + url.strip()

    async with async_playwright() as playwright:
        args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-extensions",
            "--disable-software-rasterizer",
        ]
        
        browser = await playwright.chromium.launch(headless=True, args=args)
        
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.biorxiv.org/",
                "Upgrade-Insecure-Requests": "1"
            },
            viewport={'width': 1920, 'height': 1080}
        )

        page = await context.new_page()

        try:
            await page.goto(url, wait_until="load", timeout=120000)

            pdf_link = None
            selectors = [
                'a[href$=".full.pdf"]',
                'a[href$=".pdf"]',
                'a[href*="/content/"]'
            ]
            for selector in selectors:
                try:
                    await page.wait_for_selector(selector, timeout=15000)
                    pdf_link = await page.get_attribute(selector, 'href')
                    if pdf_link:
                        break
                except:
                    continue

            if not pdf_link:
                match = re.search(r"(10\.\d{4,9}/[^\s/]+)", url)
                if match:
                    doi = match.group(1)
                    pdf_link = f"https://www.biorxiv.org/content/{doi}.full.pdf"
                    print("Fallback PDF URL:", pdf_link)
                else:
                    raise Exception("PDF link not found on page")

            if pdf_link.startswith("/"):
                pdf_link = f"https://www.biorxiv.org{pdf_link}"

            print("Final PDF URL:", pdf_link)

            #  Download within Playwright browser to bypass 403
            async with page.expect_download() as download_info:
                await page.evaluate(f'window.open("{pdf_link}", "_blank");')

            download = await download_info.value

            # Save the downloaded file
            path = f"temp/downloads/paper_{paper_id}_source.pdf"
            os.makedirs(os.path.dirname(path), exist_ok=True)
            await download.save_as(path)

            # Read the file into UploadFile
            async with aiofiles.open(path, "rb") as file_obj:
                pdf_bytes = await file_obj.read()

            content = io.BytesIO(pdf_bytes)
            headers = Headers({"content-type": "application/pdf"})
            upload_file = UploadFile(
                file=content,
                filename=f"paper_{paper_id}.pdf",
                headers=headers
            )

            print(f" Downloaded BioRxiv PDF to {path}")
            return upload_file

        except Exception as e:
            print(f" Error downloading paper: {e}")
            raise HTTPException(status_code=500, detail=f"Error downloading paper: {e}")

        finally:
            await browser.close()


@router.post("/upload-zip", response_model=PaperResponse)
async def upload_zip_file(request: Request, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
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
        
        # Track paper upload
        user_ctx = get_user_context(request, current_user)
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='latex',
            filename=file.filename,
            title=metadata.get('title'),
            metadata=metadata
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        
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
async def scrape_arxiv(fastapi_request: Request, request: ArxivRequest, current_user: dict = Depends(get_current_user)):
    """Scrape LaTeX source from arXiv URL."""
    # scraper = ArxivScraper()
    paper_id = str(uuid.uuid4())
    if(('biorxiv.org' in request.arxiv_url) 
    or 'medrxiv.org' in request.arxiv_url
    ):
        try:
            print("for bioarxiv")
            file = await download_biorxiv_paper(request.arxiv_url, paper_id) 
            return await upload_pdf_file(file)
        except Exception as e:
            logger.error(f"Error scraping arXiv: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error scraping arXiv: {str(e)}")

    scraper = ArxivScraper()
    
    try:
        print("for arxiv")
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
        
        # Track paper upload
        user_ctx = get_user_context(fastapi_request, current_user)
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='arxiv',
            filename=request.arxiv_url,
            title=metadata.get('title'),
            metadata=metadata
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        
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

# app/routes/papers.py
from app.utils.timing import track_performance

@track_performance
async def save_uploaded_file(file: UploadFile, pdf_path: str):
    """Track file upload/save time."""
    with open(pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)


@track_performance
async def wait_for_worker_result(pdf_job):
    """Track time spent waiting for worker."""
    return await pdf_job.result(timeout=600, poll_delay=2.0)


@router.post("/upload-pdf", response_model=PaperResponse)
async def upload_pdf_file(request: Request, file: UploadFile = File(...), language: str = Form(...), current_user: dict = Depends(get_current_user), api_keys: dict = Depends(get_api_keys)):
    """Upload and process a PDF file of a research paper."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    os.makedirs(temp_dir, exist_ok=True)
    paper_language = language
    print("paper_language", paper_language)
    
    try:
        # Save uploaded PDF file (tracked)
        pdf_path = os.path.join(temp_dir, file.filename)
        await save_uploaded_file(file, pdf_path)
        
        gemini_api_key = api_keys.get("gemini_key")
        if not gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")

        # Process the PDF file using pdf_processor_worker
        pool = await create_pool(RedisSettings())
        try:
            pdf_job = await pool.enqueue_job(
                'process_pdf_file_task',
                pdf_path, paper_id, "paper", gemini_api_key,
                _queue_name='pdf_processor_queue'
            )
            # Wait for result (tracked)
            result = await wait_for_worker_result(pdf_job)
        finally:
            await pool.close()
        
        # Store paper info
        result["source_type"] = "pdf"
        result["language"] = paper_language
        save_paper_info(paper_id, result)
        
        # Track paper upload
        user_ctx = get_user_context(request, current_user)
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='pdf',
            filename=file.filename,
            title=result["metadata"].get('title'),
            metadata=result.get("metadata")
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))
        
        
        logger.info(f"Paper {paper_id} processed and stored with keys: {list(result.keys())}")
        
        return PaperResponse(
            paper_id=paper_id,
            metadata=PaperMetadata(**result["metadata"]),
            image_files=[os.path.basename(f) for f in result["image_files"]],
            tex_file_path=result["tex_file_path"],
            status="processed"
        )
        
    except Exception as e:
        logger.error(f"Error processing PDF file: {str(e)}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing PDF file: {str(e)}")



# @router.post("/upload-pdf")
# # async def upload_pdf_file(file: UploadFile = File(...)):
# async def upload_pdf_file(file: UploadFile = File(...), api_keys: dict = Depends(get_api_keys)):
#     if not file.filename.endswith(".pdf"):
#         raise HTTPException(400, "Only PDF files are allowed")

#     paper_id = str(uuid.uuid4())
#     temp_dir = f"temp/papers/{paper_id}"
#     os.makedirs(temp_dir, exist_ok=True)

#     try:
#         with job_status_lock:
#             job_status[paper_id] = {
#                 "status": "initializing",
#                 "progress": 0,
#                 "stage": "initializing",
#                 "error": None,
#                 "metadata": None,
#                 "created_at": time.time(),
#             }

#         pdf_path = os.path.join(temp_dir, file.filename)
#         with open(pdf_path, "wb") as buffer:
#             shutil.copyfileobj(file.file, buffer)

#         # gemini_api_key = os.getenv("GEMINI_API_KEY")
#         gemini_api_key = api_keys.get("gemini_key")
#         if not gemini_api_key:
#             raise HTTPException(400, "Gemini API key not configured")

#         asyncio.create_task(
#             process_pdf_to_metadata_background(
#                 paper_id=paper_id,
#                 pdf_path=pdf_path,
#                 temp_dir=temp_dir,
#                 type="paper",
#                 gemini_api_key=gemini_api_key,
#             )
#         )

#         return {
#             "job_id": paper_id,
#             "status": "processing",
#             "status_endpoint": f"/upload_pdf_to_metadata/{paper_id}/status",
#         }

#     except Exception as e:
#         shutil.rmtree(temp_dir, ignore_errors=True)
#         raise HTTPException(500, str(e))

# async def process_pdf_to_metadata_background(
#     paper_id: str,
#     pdf_path: str,
#     temp_dir: str,
#     type: str,
#     gemini_api_key: str,
# ):
#     with job_status_lock:
#         job_status[paper_id]["status"] = "queued"
#         job_status[paper_id]["stage"] = "waiting for processing slot"

#     async with processing_semaphore:
#         try:
#             with job_status_lock:
#                 job_status[paper_id]["status"] = "processing"
#                 job_status[paper_id]["progress"] = 10
#                 job_status[paper_id]["stage"] = "extracting pdf"

#             result = await process_pdf_file(
#                 pdf_path, paper_id, type, gemini_api_key
#             )

#             result["source_type"] = "pdf"
#             save_paper_info(paper_id, result)

#             with job_status_lock:
#                 job_status[paper_id]["status"] = "completed"
#                 job_status[paper_id]["progress"] = 100
#                 job_status[paper_id]["stage"] = "completed"
#                 job_status[paper_id]["metadata"] = PaperMetadata(
#                     **result["metadata"]
#                 )
#                 job_status[paper_id]["image_files"] = [
#                     os.path.basename(f) for f in result["image_files"]
#                 ]
#                 job_status[paper_id]["tex_file_path"] = result["tex_file_path"]

#         except Exception as e:
#             with job_status_lock:
#                 job_status[paper_id]["status"] = "failed"
#                 job_status[paper_id]["error"] = str(e)

#             shutil.rmtree(temp_dir, ignore_errors=True)


# @router.get("/upload_pdf_to_metadata/{job_id}/status")
# async def get_job_status_pdf_extraction(job_id: str):
#     await asyncio.sleep(0)

#     with job_status_lock:
#         if job_id not in job_status:
#             raise HTTPException(404, "Job not found")
#         status_info = job_status[job_id].copy()

#     return status_info




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
