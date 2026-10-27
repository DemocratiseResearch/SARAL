"""The PDF worker must not require the absent legacy full-generation module."""

import subprocess
import sys
import unittest
from contextlib import ExitStack
from unittest.mock import patch


class WorkerStartupTests(unittest.TestCase):
    def test_import_without_legacy_generator(self):
        result = subprocess.run(
            [sys.executable, "-c", "import worker"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_pdf_only_job_works_without_legacy_generator(self):
        import worker

        with ExitStack() as stack:
            render = stack.enter_context(
                patch.object(worker, "render_business_brief_pdf", return_value=b"pdf")
            )
            stack.enter_context(
                patch.object(
                    worker.storage, "upload_bytes", return_value="gs://test/brief.pdf"
                )
            )
            result = worker._process_brief_pdf_only(
                {
                    "brief_id": "brief",
                    "paper_id": "paper",
                    "user_id": "user",
                    "sections_json": '{"Executive Summary":"Test summary"}',
                }
            )
        self.assertEqual(
            result, {"status": "completed", "pdf_gcs_path": "gs://test/brief.pdf"}
        )
        render.assert_called_once_with(
            {"Executive Summary": "Test summary"}, paper_title="Research Paper"
        )

    def test_v2_full_job_does_not_import_legacy_generator(self):
        import worker

        with ExitStack() as stack:
            for target, name, value in [
                (worker, "USE_V2", True),
                (worker, "load_and_clean", "Paper text"),
                (
                    worker,
                    "generate_business_brief_v2",
                    {"Executive Summary": "Summary"},
                ),
                (worker, "render_business_brief_pdf", b"pdf"),
                (worker.storage, "download_bytes", b"Paper"),
                (worker.storage, "upload_json", "gs://test/brief.json"),
                (worker.storage, "upload_bytes", "gs://test/brief.pdf"),
            ]:
                if name == "USE_V2":
                    stack.enter_context(patch.object(target, name, value))
                else:
                    stack.enter_context(patch.object(target, name, return_value=value))
            result = worker._process_brief_full(
                {
                    "brief_id": "brief",
                    "paper_id": "paper",
                    "user_id": "user",
                    "text_path": "gs://test/text",
                    "gemini_key": "local-test-placeholder",
                }
            )
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["model_version"], "v2")


if __name__ == "__main__":
    unittest.main()
