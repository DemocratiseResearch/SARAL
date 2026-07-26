"""FFmpeg worker entrypoint.

Thin orchestration layer: consumes jobs from the Redis stream and dispatches
each to its render mode (``waveform``, ``slides``, ``reel``); owns the worker
lifecycle (startup reclaim sweep, main loop, SIGTERM shutdown). Rendering lives
in the per-mode modules; shared building blocks are in ``ffmpeg_utils``,
``subtitles``, ``media_io`` and ``imaging``.
"""

import logging
import os
import signal
import sys
from pathlib import Path

import redis as redis_lib
from dotenv import load_dotenv

# saral_shared reads env (bucket, gateway URL) at import time, so load the
# shared dotenv before importing the render modules that pull it in.
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env.shared")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("ffmpeg-worker")

from config import CONSUMER, GROUP, STREAM  # noqa: E402
from reel import _process_reel_video  # noqa: E402
from slides import _process_frame_based_video  # noqa: E402
from waveform import _process_waveform_video  # noqa: E402

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


def process_job(rdb, msg_id: str, data: dict):
    log.info("msg_id=%s: received job with keys=%s", msg_id, list(data.keys()))
    run_id = data["run_id"]
    step_id = data["step_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    mode = data.get("mode", "frame-based")  # "frame-based" or "waveform"

    log.info("run_id=%s: mode=%s", run_id, mode)

    if mode == "waveform":
        return _process_waveform_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)
    elif mode == "reel":
        return _process_reel_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)
    else:
        return _process_frame_based_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)


def main():
    global _rdb
    _rdb = redis_lib.from_url(os.environ["REDIS_URL"], decode_responses=True)

    try:
        _rdb.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
    except redis_lib.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

    log.info("FFmpeg worker started, consumer=%s", CONSUMER)

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
                process_job(_rdb, msg_id, data)
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
                process_job(_rdb, msg_id, data)
                _current_msg_id = None
        except redis_lib.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s")
            import time
            time.sleep(5)
        except Exception:
            log.exception("FFmpeg worker loop error")
            import time
            time.sleep(2)


if __name__ == "__main__":
    main()
