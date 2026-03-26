from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from typing import Optional
import shutil
import os
import uuid
from pathlib import Path
import asyncio
import logging 
from app.services.poster_service import poster_service
from app.workers import get_worker_pool
from app.auth.dependencies import get_current_user
from app.services.metadata_tracker import track_paper_upload, track_output_generation
from app.middleware.session_tracking import get_user_context
from app.services.firestore_helpers import init_pipeline_tracking, update_pipeline_step, mark_pipeline_failed
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__) 

async def wait_for_poster_result(job, paper_id: str, timeout: int = 600):
    logger.info(f"[{paper_id[:8]}] Waiting for poster generation to complete...")
    result = await job.result(timeout=timeout, poll_delay=2.0)
    return result

@router.post("/generate")
async def generate_poster(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    template: Optional[str] = Form(None),
    pool = Depends(get_worker_pool)
):
    # Validate file extension
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Normalise template: empty string → "default"
    effective_template = (template or "default").strip() or "default"

    paper_id = uuid.uuid4().hex
    temp_dir = Path(f"temp/papers/{paper_id}/source")
    temp_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = temp_dir / "paper.pdf"
    try:
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    _step_started_at: datetime = datetime.now()
    try:
        # Track paper upload in Firestore so dashboard can find it
        user_ctx = get_user_context(request, current_user)
        track_paper_upload(
            paper_id=paper_id,
            user_id=user_ctx.get('user_id'),
            user_email=user_ctx.get('user_email'),
            session_id=user_ctx.get('session_id'),
            source_type='pdf',
            filename=file.filename
        )
        init_pipeline_tracking(paper_id, user_id=user_ctx.get('user_id'))

        _step_started_at = datetime.now()
        update_pipeline_step(
            paper_id, "poster_generation",
            metadata={"template": effective_template},
            started_at=_step_started_at, status="in_progress"
        )

        # Enqueue to ARQ worker (pass template as kwarg so it doesn't shift positional arg count)
        job = await pool.enqueue_job(
            'generate_poster_via_go',
            paper_id,
            str(pdf_path),
            f"temp/posters/{paper_id}",
            _queue_name='poster_queue',
            template=effective_template,
        )
        # Wait for job to complete
        result = await wait_for_poster_result(job, paper_id)

        if result and result.get('status') == 'success':
            logger.info(f"[{paper_id[:8]}] Poster generation completed successfully (template={effective_template})")

            # Determine output file path (PDF or ZIP depending on template)
            output_file_path = result.get('pdf_path') or result.get('zip_path')

            # Track output generation
            user_ctx = get_user_context(request, current_user)
            track_output_generation(
                paper_id=paper_id,
                output_type='poster',
                file_path=output_file_path,
                user_id=user_ctx.get('user_id')
            )


            update_pipeline_step(
                paper_id, "poster_generation",
                metadata={
                    "template": effective_template,
                    "output_file": output_file_path,
                },
                started_at=_step_started_at, status="completed"
            )

            return result  # Contains: pdf_path|zip_path, template, work_dir, instance, job_id
        else:
            error_detail = result.get('error', 'Poster generation failed or returned no result') if isinstance(result, dict) else 'Poster generation failed or returned no result'
            mark_pipeline_failed(paper_id, "poster_generation", Exception(error_detail), started_at=_step_started_at)
            raise HTTPException(
                status_code=500,
                detail=error_detail
            )
    except HTTPException:
        raise
    except Exception as e:
        mark_pipeline_failed(paper_id, "poster_generation", e, started_at=_step_started_at)
        logger.error(f"[{paper_id[:8]}] Error generating poster: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating poster: {str(e)}"
        )
# Keep existing download endpoint
from fastapi.responses import FileResponse
@router.get("/download")
async def download_poster(file_path: str):
    path = Path(file_path).resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    suffix = path.suffix.lower()
    if suffix == '.zip':
        return FileResponse(path, filename="poster.zip", media_type="application/zip")
    return FileResponse(path, filename="poster.pdf", media_type="application/pdf")