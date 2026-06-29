from __future__ import annotations

import logging
import os
import signal
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import redis as redis_lib
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env.shared")

from saral_shared import storage_client as storage  # noqa: E402
from saral_shared import webhook_client as wh  # noqa: E402

from latex_template import compile_latex  # noqa: E402
from latex_poster_template import build_poster_document, create_theme_files  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("poster-worker")

STREAM = "saral:jobs:poster"
GROUP = "saral-workers"
CONSUMER = f"poster-worker-{os.environ.get('HOSTNAME', str(os.getpid()))}"

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


def process_poster_job(rdb, msg_id: str, data: dict) -> None:
    run_id = data["run_id"]
    step_id = data["step_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    poster_content_gcs_path = data["poster_content_gcs_path"]

    log.info("poster-worker: processing run_id=%s", run_id)

    try:
        wh.send_webhook({
            "run_id":        run_id,
            "step_id":       step_id,
            "step_name":     "poster_image_extract",
            "status":        "processing",
            "gcs_output_path": "",
            "error_message": "Extracting poster images",
            "next_step":     "",
            "next_job_data": {},
        })

        # 1. Download poster_content.json
        poster_content = storage.download_json(poster_content_gcs_path)

        selected_images: list[str] = poster_content.get("selected_images", [])
        extracted_gcs_path: str = data.get("extracted_gcs_path", "")

        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)

            # 2. Download images locally (up to 2)
            local_image_paths: list[str] = []
            assets_dir = workdir / "assets"
            assets_dir.mkdir(parents=True, exist_ok=True)

            for i, gcs_img_path in enumerate(selected_images[:2]):
                suffix = Path(gcs_img_path).suffix or ".png"
                local_path = assets_dir / f"figure_{i}{suffix}"
                try:
                    storage.download_to_file(gcs_img_path, str(local_path))
                    # Use relative path from workdir for LaTeX \includegraphics
                    local_image_paths.append(str(local_path.relative_to(workdir)))
                    log.info("poster-worker: downloaded image %d: %s", i, gcs_img_path)
                except Exception as exc:
                    log.warning("poster-worker: failed to download image %s: %s", gcs_img_path, exc)

            # 2b. Download ALL extracted images for bundling in the ZIP.
            all_images_dir = workdir / "all_images"
            all_images_dir.mkdir(parents=True, exist_ok=True)
            if extracted_gcs_path:
                try:
                    extracted_data = storage.download_json(extracted_gcs_path)
                    all_image_paths: list[str] = extracted_data.get("image_paths", [])
                    for gcs_img in all_image_paths:
                        suffix = Path(gcs_img).suffix or ".png"
                        fname = Path(gcs_img).name or f"image_{all_image_paths.index(gcs_img)}{suffix}"
                        local_all = all_images_dir / fname
                        try:
                            storage.download_to_file(gcs_img, str(local_all))
                        except Exception as exc:
                            log.warning("poster-worker: failed to download all_image %s: %s", gcs_img, exc)
                except Exception as exc:
                    log.warning("poster-worker: could not fetch extracted images: %s", exc)

            wh.send_webhook({
                "run_id":        run_id,
                "step_id":       step_id,
                "step_name":     "poster_image_extract",
                "status":        "completed",
                "gcs_output_path": "",
                "error_message": "",
                "next_step":     "",
                "next_job_data": {},
            })

            # 3. Write theme files
            create_theme_files(workdir)

            # 4. Build LaTeX source
            tex_source = build_poster_document(poster_content, local_image_paths)
            tex_path = workdir / "poster.tex"
            tex_path.write_text(tex_source, encoding="utf-8")

            # 5. Compile LaTeX to PDF
            build_dir = workdir / "build"
            build_dir.mkdir(parents=True, exist_ok=True)
            pdf_path = compile_latex(str(tex_path), str(build_dir))

            # 6. Create ZIP: poster.pdf + poster.tex + .sty files + poster images + all extracted images
            zip_path = workdir / "poster.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.write(pdf_path, arcname="poster.pdf")
                zf.write(str(tex_path), arcname="poster.tex")
                for sty in workdir.glob("*.sty"):
                    zf.write(str(sty), arcname=sty.name)
                for img in assets_dir.iterdir():
                    if img.is_file():
                        zf.write(str(img), arcname=f"assets/{img.name}")
                for img in all_images_dir.iterdir():
                    if img.is_file():
                        zf.write(str(img), arcname=f"all_images/{img.name}")

            # 7. Upload ZIP to GCS
            zip_key = f"{user_id}/{paper_id}/runs/{run_id}/poster_compile/poster.zip"
            zip_gcs_path = storage.upload_file(
                str(zip_path), zip_key, content_type="application/zip"
            )

        # 8. Webhook — next_step="" signals terminal step
        wh.send_webhook({
            "run_id":          run_id,
            "step_id":         step_id,
            "step_name":       "poster_compile",
            "status":          "completed",
            "gcs_output_path": zip_gcs_path,
            "error_message":   "",
            "next_step":       "",
            "next_job_data":   {},
        })

        rdb.xack(STREAM, GROUP, msg_id)
        log.info("poster-worker: completed run_id=%s zip=%s", run_id, zip_gcs_path)

    except Exception as exc:
        log.exception("poster-worker: run_id=%s failed", run_id)
        try:
            wh.send_webhook({
                "run_id":        run_id,
                "step_id":       step_id,
                "step_name":     "poster_compile",
                "status":        "failed",
                "error_message": str(exc),
                "next_step":     "",
                "next_job_data": {},
            })
        except Exception:
            pass


def main():
    global _rdb
    _rdb = redis_lib.from_url(os.environ["REDIS_URL"], decode_responses=True)

    try:
        _rdb.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
    except redis_lib.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

    log.info("Poster worker started, consumer=%s", CONSUMER)

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
                process_poster_job(_rdb, msg_id, data)
                _current_msg_id = None
            if next_id == "0-0":
                break
    except Exception as exc:
        log.warning("[startup] XAUTOCLAIM sweep error: %s", exc)

    while True:
        try:
            messages = _rdb.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=1, block=5000)
            if not messages:
                continue
            _, stream_messages = messages[0]
            for msg_id, data in stream_messages:
                _current_msg_id = msg_id
                process_poster_job(_rdb, msg_id, data)
                _current_msg_id = None
        except redis_lib.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s")
            time.sleep(5)
        except Exception:
            log.exception("Poster worker loop error")
            time.sleep(2)


if __name__ == "__main__":
    main()
