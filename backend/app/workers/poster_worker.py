import httpx
import logging
from pathlib import Path
from typing import Dict, Any
import random
import os
from itertools import cycle

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Go service instances (will be load balanced)
# Can be overridden via environment variable for VM deployment
GO_POSTER_INSTANCES = [
    'http://localhost:8080',
    'http://localhost:8081'
]

logger.info(f"Go Poster instances configured: {GO_POSTER_INSTANCES}")

# Global round-robin iterator (thread-safe in asyncio, atomic operation)
_instance_iterator = cycle(GO_POSTER_INSTANCES)

class GoPosterClient:
    """Client for Go poster service with load balancing."""
    def __init__(self, instances: list = None):
        self.instances = instances or GO_POSTER_INSTANCES
        self.timeout = 300.0  # 5 minutes
    
    def _get_next_instance(self) -> str:
        """Round-robin using itertools.cycle (atomic in asyncio event loop)."""
        global _instance_iterator
        instance = next(_instance_iterator)
        logger.info(f"[LOAD BALANCER] Selected: {instance}")
        return instance
    async def generate_poster(
        self,
        pdf_path: str,
        output_dir: str,
        template: str = "default",
        max_retries: int = 2
    ) -> Dict[str, Any]:
        for attempt in range(max_retries):
            instance = self._get_next_instance()
            try:
                logger.info(f"Attempt {attempt + 1}: Calling {instance}/poster (template={template})")
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    with open(pdf_path, 'rb') as f:
                        files = {'pdf': (Path(pdf_path).name, f, 'application/pdf')}
                        data = {'template': template or 'default'}
                        response = await client.post(
                            f"{instance}/poster",
                            files=files,
                            data=data
                        )
                        response.raise_for_status()
                        # Extract job ID and output dir from headers
                        job_id = response.headers.get('X-Job-ID', 'unknown')
                        remote_output_dir = response.headers.get('X-Output-Dir', '')
                        content_type = response.headers.get('Content-Type', '')
                        output_path = Path(output_dir)
                        output_path.mkdir(parents=True, exist_ok=True)
                        if 'application/zip' in content_type:
                            save_path = output_path / "poster.zip"
                            save_path.write_bytes(response.content)
                            logger.info(f"Poster ZIP generated successfully: {save_path}")
                            return {
                                "status": "success",
                                "zip_path": str(save_path),
                                "template": template,
                                "work_dir": str(output_dir),
                                "instance": instance,
                                "job_id": job_id,
                                "remote_output_dir": remote_output_dir
                            }
                        else:
                            # Normal template: save PDF
                            save_path = output_path / "poster.pdf"
                            save_path.write_bytes(response.content)
                            logger.info(f"Poster PDF generated successfully: {save_path}")
                            return {
                                "status": "success",
                                "pdf_path": str(save_path),
                                "template": template,
                                "work_dir": str(output_dir),
                                "instance": instance,
                                "job_id": job_id,
                                "remote_output_dir": remote_output_dir
                            }
            except httpx.HTTPError as e:
                logger.error(f"Failed to call {instance}: {e}")
                if attempt < max_retries - 1:
                    logger.info("Retrying with next instance...")
                    continue
                else:
                    return {
                        "status": "failed",
                        "error": f"All instances failed. Last error: {str(e)}"
                    }
        return {"status": "failed", "error": "Max retries exceeded"}
# ARQ worker function
async def generate_poster_via_go(
    ctx: dict,
    paper_id: str,
    pdf_path: str,
    output_dir: str = None,
    template: str = "default"
) -> Dict[str, Any]:
    logger.info(f"[POSTER WORKER] Starting poster generation for paper_id: {paper_id}")
    logger.info(f"[POSTER WORKER] PDF path: {pdf_path}, template: {template}")
    
    if output_dir is None:
        output_dir = f"temp/posters/{paper_id}"
    
    logger.info(f"[POSTER WORKER] Output directory: {output_dir}")
    
    client = GoPosterClient()
    try:
        logger.info(f"[POSTER WORKER] Calling Go poster service...")
        result = await client.generate_poster(
            pdf_path=pdf_path,
            output_dir=output_dir,
            template=template
        )
        logger.info(f"[POSTER WORKER] Poster generation completed with status: {result.get('status')}")
        return result
    except Exception as e:
        logger.exception(f"[POSTER WORKER] Poster generation failed for {paper_id}")
        return {"status": "failed", "error": str(e)}


async def startup(ctx):
    logger.info("Poster Worker starting up...")


async def shutdown(ctx):
    logger.info("Poster Worker shutting down...")


class PosterWorkerSettings:
    """Configuration for poster generation worker."""
    from arq.connections import RedisSettings
    
    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [generate_poster_via_go]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'poster_queue'
    max_jobs = 4  # Can handle multiple poster generation jobs
    job_timeout = 600  # 10 minutes timeout for poster generation
    keep_result = 7200  # Keep results for 2 hours
    allow_abort_jobs = True
    max_tries = 3


if __name__ == '__main__':
    import sys
    from arq import run_worker
    
    sys.exit(run_worker(PosterWorkerSettings))
