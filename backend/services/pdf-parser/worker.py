import asyncio
import logging
import os
import signal
import sys
import tempfile

import redis as redis_lib
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env.shared")

from saral_shared import db_client as db_ops  # noqa: E402
from saral_shared import storage_client as storage  # noqa: E402
from saral_shared import webhook_client as wh  # noqa: E402
from saraldocling import parse_pdf, ParseConfig  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
log = logging.getLogger("pdf-parser")

STREAM   = "saral:jobs:pdf"
GROUP    = "saral-workers"
CONSUMER = f"pdf-parser-{os.environ.get('HOSTNAME', str(os.getpid()))}"
BLOCK_MS = 5000

# Module-level state for SIGTERM handler
_rdb = None
_current_msg_id = None


def _sigterm_handler(sig, frame):
    log.info("[SIGTERM] shutting down, cleaning up consumer %s", CONSUMER)
    try:
        if _current_msg_id and _rdb:
            _rdb.xack(STREAM, GROUP, _current_msg_id)
        if _rdb:
            _rdb.xgroup_delconsumer(STREAM, GROUP, CONSUMER)
    except Exception as exc:
        log.warning("[SIGTERM] cleanup error: %s", exc)
    sys.exit(0)


signal.signal(signal.SIGTERM, _sigterm_handler)


async def process_job_async(rdb, msg_id: str, data: dict, pool):
    run_id        = data["run_id"]
    step_id       = data["step_id"]
    paper_id      = data["paper_id"]
    user_id       = data["user_id"]
    gcs_path      = data["gcs_path"]
    pipeline_type = data.get("pipeline_type", "video")
    log.info(f"Processing run_id={run_id} pipeline_type={pipeline_type}")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            local_pdf = os.path.join(tmpdir, "paper.pdf")
            storage.download_to_file(gcs_path, local_pdf)

            extract_dir = Path(f"tmp/{run_id}/source")
            #extract_dir = Path(tmpdir) / "source"
            extract_dir.mkdir(parents=True, exist_ok=True)

            loop = asyncio.get_event_loop()
            parse_result = await loop.run_in_executor(
                None,
                lambda: parse_pdf(ParseConfig(
                    pdf_path=str(local_pdf),
                    output_dir=str(extract_dir),
                    extract_images=True,
                ))
            )

            log.info(
                f"run_id={run_id}: parsed {parse_result.num_pages} pages, "
                f"{len(parse_result.text)} chars, "
                f"{len(parse_result.image_paths)} images"
            )

            #Upload images to GCS 
            image_gcs_paths = []
            for img_path in parse_result.image_paths:
                img_path = Path(img_path)
                if img_path.exists():
                    img_key = f"{user_id}/{paper_id}/runs/{run_id}/pdf_extract/images/{img_path.name}"
                    gcs_img_path = storage.upload_bytes(
                        data=img_path.read_bytes(),
                        object_key=img_key,
                        content_type="image/png",
                    )
                    image_gcs_paths.append(gcs_img_path)

            text_key = f"{user_id}/{paper_id}/runs/{run_id}/pdf_extract/extracted_text.txt"
            storage.upload_bytes(
                data=parse_result.text.encode("utf-8"),
                object_key=text_key,
                content_type="text/plain",
            )

            bucket = os.getenv("STORAGE_BUCKET", "saral-artifacts-local")
            result = {
                "text":          parse_result.text,
                "num_pages":     parse_result.num_pages,
                "image_paths":   image_gcs_paths,
                "text_gcs_path": f"gs://{bucket}/{text_key}",
                "status":        "processed",
            }

            object_key  = f"{user_id}/{paper_id}/runs/{run_id}/pdf_extract/extracted.json"
            output_path = storage.upload_json(result, object_key)

        await db_ops.complete_step(pool, step_id, output_path)

        step_name = "pdf_extract"
        next_step = "metadata_extract"
        if pipeline_type == "podcast":
            step_name = "podcast_pdf_extract"
            next_step = "script_gen"
        
        wh.send_webhook({
            "run_id":          run_id,
            "step_id":         step_id,
            "step_name":       step_name,
            "status":          "completed",
            "gcs_output_path": output_path,
            "error_message":   "",
            "next_step":       next_step,
            "next_job_data": {
                "paper_id":           paper_id,
                "user_id":            user_id,
                "extracted_gcs_path": output_path,
                "gemini_key":         data.get("gemini_key", ""),
                "sarvam_key":         data.get("sarvam_key", ""),
                "mode":               data.get("mode", "video"),
            },
        })

        rdb.xack(STREAM, GROUP, msg_id)
        log.info(f"run_id={run_id}: complete, XACK'd")

    except Exception as e:
        log.error(f"run_id={run_id}: failed: {e}", exc_info=True)
        await db_ops.fail_step(pool, step_id, str(e))
        try:
            step_name = "pdf_extract"
            if pipeline_type == "podcast":
                step_name = "podcast_pdf_extract"
            wh.send_webhook({
                "run_id":      run_id,
                "step_id":     step_id,
                "step_name":   step_name,
                "status":      "failed",
                "error_message": str(e),
                "next_step":   "",
                "next_job_data": {},
            })
        except Exception:
            pass


async def main_async():
    global _rdb
    log.info(f"PDF Parser starting, consumer={CONSUMER}")
    _rdb = redis_lib.from_url(os.environ["REDIS_URL"], decode_responses=True)

    try:
        _rdb.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
    except redis_lib.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise

    # ── Startup XAUTOCLAIM sweep: reclaim jobs from any previous crashed instance
    log.info("[startup] XAUTOCLAIM sweep for orphaned messages")
    try:
        next_id = "0-0"
        while True:
            next_id, claimed, _ = _rdb.xautoclaim(
                STREAM, GROUP, CONSUMER,
                min_idle_time=300000,  # 5 minutes in ms
                start_id=next_id,
                count=10,
            )
            if not claimed:
                break
            log.info("[startup] reclaimed %d orphaned messages", len(claimed))
            for msg_id, data in claimed:
                global _current_msg_id
                _current_msg_id = msg_id
                pool = await db_ops.init_pool()
                await process_job_async(_rdb, msg_id, data, pool)
                _current_msg_id = None
            if next_id == "0-0":
                break
    except Exception as exc:
        log.warning("[startup] XAUTOCLAIM sweep error: %s", exc)

    pool = await db_ops.init_pool()
    log.info("Connected to Postgres")

    while True:
        try:
            messages = _rdb.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=1, block=5000)
            if not messages:
                continue
            _, stream_messages = messages[0]
            for msg_id, data in stream_messages:
                _current_msg_id = msg_id
                await process_job_async(_rdb, msg_id, data, pool)
                _current_msg_id = None
        except redis_lib.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s")
            await asyncio.sleep(5)
        except Exception as e:
            log.error(f"Loop error: {e}", exc_info=True)
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main_async())
