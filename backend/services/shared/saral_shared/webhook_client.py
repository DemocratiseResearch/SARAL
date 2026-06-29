import os
import time
import logging
import httpx

log = logging.getLogger(__name__)

GATEWAY_URL = os.environ.get("GATEWAY_WEBHOOK_URL", "http://localhost:8080")


def send_webhook(payload: dict, max_retries: int = 3, retry_delay: float = 2.0):
    step_name = payload.get("step_name", "unknown")
    url = f"{GATEWAY_URL}/webhooks/worker/{step_name}"

    for attempt in range(1, max_retries + 1):
        try:
            response = httpx.post(
                url,
                json=payload,
                timeout=10.0,
            )
            response.raise_for_status()
            log.info("Webhook sent to %s (attempt %d): %s", url, attempt, response.status_code)
            return
        except (httpx.HTTPError, httpx.RequestError) as exc:
            log.warning("Webhook attempt %d/%d failed: %s", attempt, max_retries, exc)
            if attempt < max_retries:
                time.sleep(retry_delay)

    log.error("Webhook failed after %d attempts. Gateway unreachable.", max_retries)
    raise RuntimeError(f"Webhook failed after {max_retries} attempts")
