import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from urllib.parse import urlsplit

import httpx

log = logging.getLogger(__name__)
GATEWAY_URL = os.environ.get("GATEWAY_WEBHOOK_URL", "http://localhost:8080").rstrip("/")


def validate_webhook_config() -> None:
    """Fail worker startup early if signed callbacks cannot be produced."""
    if len(os.environ.get("WORKER_WEBHOOK_SECRET", "").encode("utf-8")) < 32:
        raise RuntimeError("WORKER_WEBHOOK_SECRET is missing or shorter than 32 bytes")


def build_signature_headers(
    secret: str,
    method: str,
    request_target: str,
    body: bytes,
    *,
    timestamp: str | None = None,
    nonce: str | None = None,
) -> dict[str, str]:
    """Create gateway-compatible HMAC headers for a worker request.

    Canonical bytes are: METHOD + newline + request-target + newline + timestamp
    + newline + nonce + newline + raw HTTP body. request_target is path plus
    optional query string, without scheme or host.
    """
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError("WORKER_WEBHOOK_SECRET must contain at least 32 bytes")
    timestamp = timestamp or str(int(time.time()))
    nonce = nonce or secrets.token_hex(16)
    canonical = (
        f"{method.upper()}\n{request_target}\n{timestamp}\n{nonce}\n".encode() + body
    )
    signature = hmac.new(secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    return {
        "X-Saral-Worker-Timestamp": timestamp,
        "X-Saral-Worker-Nonce": nonce,
        "X-Saral-Worker-Signature": signature,
    }


def send_webhook(payload: dict, max_retries: int = 3, retry_delay: float = 2.0):
    step_name = payload.get("step_name", "unknown")
    url = f"{GATEWAY_URL}/webhooks/worker/{step_name}"
    secret = os.environ.get("WORKER_WEBHOOK_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError("WORKER_WEBHOOK_SECRET is missing or shorter than 32 bytes")

    # Sign exactly the serialized bytes sent on the wire. Each retry gets a new
    # timestamp and nonce so a retry is not rejected as a replay.
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    parsed = urlsplit(url)
    request_target = parsed.path or "/"
    if parsed.query:
        request_target += "?" + parsed.query

    for attempt in range(1, max_retries + 1):
        try:
            headers = {"Content-Type": "application/json"}
            headers.update(
                build_signature_headers(secret, "POST", request_target, body)
            )
            response = httpx.post(url, content=body, headers=headers, timeout=10.0)
            response.raise_for_status()
            log.info(
                "Signed webhook sent to %s (attempt %d): %s",
                url,
                attempt,
                response.status_code,
            )
            return
        except (httpx.HTTPError, httpx.RequestError) as exc:
            log.warning("Webhook attempt %d/%d failed: %s", attempt, max_retries, exc)
            if attempt < max_retries:
                time.sleep(retry_delay)

    log.error("Webhook failed after %d attempts. Gateway unreachable.", max_retries)
    raise RuntimeError(f"Webhook failed after {max_retries} attempts")
