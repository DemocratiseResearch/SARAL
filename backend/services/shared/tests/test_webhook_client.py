import hashlib
import hmac
import os
import unittest
from unittest.mock import patch

from saral_shared.webhook_client import build_signature_headers, validate_webhook_config


class WebhookSignatureTests(unittest.TestCase):
    def test_signature_matches_gateway_canonical_format(self):
        secret = "s" * 32
        body = b'{"run_id":"run-1"}'
        headers = build_signature_headers(
            secret,
            "POST",
            "/webhooks/worker/pdf_extract",
            body,
            timestamp="1700000000",
            nonce="a" * 32,
        )
        canonical = (
            b"POST\n/webhooks/worker/pdf_extract\n1700000000\n"
            + b"a" * 32
            + b"\n"
            + body
        )
        expected = hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
        self.assertEqual(headers["X-Saral-Worker-Signature"], expected)
        self.assertEqual(headers["X-Saral-Worker-Timestamp"], "1700000000")
        self.assertEqual(headers["X-Saral-Worker-Nonce"], "a" * 32)

    def test_rejects_short_secret(self):
        with self.assertRaises(RuntimeError):
            build_signature_headers(
                "short", "POST", "/webhooks/worker/pdf_extract", b"{}"
            )

    def test_worker_startup_requires_secret(self):
        with (
            patch.dict(os.environ, {"WORKER_WEBHOOK_SECRET": "short"}),
            self.assertRaises(RuntimeError),
        ):
            validate_webhook_config()
        with patch.dict(os.environ, {"WORKER_WEBHOOK_SECRET": "s" * 32}):
            validate_webhook_config()


if __name__ == "__main__":
    unittest.main()
