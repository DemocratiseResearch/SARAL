import asyncio
import os
import logging
import shutil
from pathlib import Path
from arq import create_pool
from arq.connections import RedisSettings

# Import PDF processing service
from app.services.pdf_processor import process_pdf_file
from app.utils.timing import track_performance, track_worker_job
from app.utils.context import set_execution_context

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

async def startup(ctx):
    logger.info("PDF Processor Worker starting up...")

async def shutdown(ctx):
    logger.info("PDF Processor Worker shutting down...")

@track_worker_job
async def process_pdf_file_task(
    ctx,
    pdf_path: str,
    paper_id: str,
    pdf_type: str,
    gemini_api_key: str,
    execution_context: str = "PDF_PROCESSOR_WORKER"
):
    """
    Independent task for processing just the PDF file.
    Extracts text, images, and metadata.
    """
    set_execution_context(execution_context)
    logger.info(f"[{paper_id[:8]}] Starting PDF processing task")
    
    try:
        # Call the actual service
        result = await process_pdf_file(
            pdf_path=pdf_path,
            paper_id=paper_id,
            pdf_type=pdf_type,
            gemini_api_key=gemini_api_key
        )
        
        logger.info(f"[{paper_id[:8]}] PDF processing task completed successfully")
        return result
        
    except Exception as e:
        logger.error(f"[{paper_id[:8]}] PDF processing task failed: {str(e)}")
        raise

class PDFProcessorWorkerSettings:
    """Configuration for PDF Processor worker."""
    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [process_pdf_file_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'pdf_processor_queue'
    max_jobs = 2
    job_timeout = 600  # 10 minutes for PDF extraction
    keep_result = 7200 # Keep results for 2 hours
    allow_abort_jobs = True
    max_tries = 3

if __name__ == '__main__':
    import sys
    from arq import run_worker
    
    sys.exit(run_worker(PDFProcessorWorkerSettings))
