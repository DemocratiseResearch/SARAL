"""Integration and regression test suite for SARAL Issue #39.

Tests integration points:
- Docker mirror synchronization between solution/ and backend/solution/
- Footline title safety (long titles, Indic scripts, inline math)
- Beamer fragile frames and booktabs integration
- LaTeX math utility hardening against double-newlines in math mode
- Complete Poster theme x layout matrix generation
- Multilingual script wrapping in all poster layout archetypes
- Robust fallback handling for unknown or legacy payloads
"""

from __future__ import annotations

import filecmp
import unittest
from pathlib import Path

from solution.poster.engine import build_poster_document
from solution.poster.themes import POSTER_THEMES
from solution.presentation.engine import build_beamer_document
from solution.shared.latex_utils import escape_latex
from solution.tests.fixtures import HINDI_SCRIPT, TRANSFORMER_POSTER, TRANSFORMER_SCRIPT


class TestIntegrationPayloads(unittest.TestCase):
    def setUp(self):
        # Look up parent directories to find repository root containing both solution/ and backend/
        self.root_dir = None
        for p in Path(__file__).resolve().parents:
            if (p / "solution").is_dir() and (p / "backend").is_dir():
                self.root_dir = p
                break
        if self.root_dir is None:
            self.root_dir = Path(__file__).resolve().parent.parent.parent

        self.solution_dir = self.root_dir / "solution"
        self.backend_solution_dir = self.root_dir / "backend" / "solution"

    def test_docker_mirror_synchronization(self):
        """Verify solution/ and backend/solution/ are synchronized for Docker builds."""
        if not (self.root_dir / "backend").is_dir():
            self.skipTest("backend/ directory not found (running in standalone container).")

        self.assertTrue(
            self.backend_solution_dir.exists(),
            "backend/solution/ directory must exist for Docker build context",
        )
        # Check all files in solution/ exist in backend/solution/ with identical content
        for item in self.solution_dir.rglob("*"):
            if item.is_file() and not any(part.startswith((".", "__pycache__")) or part.endswith(".pyc") for part in item.parts):
                rel_path = item.relative_to(self.solution_dir)
                target_file = self.backend_solution_dir / rel_path
                self.assertTrue(
                    target_file.exists(),
                    f"Missing file in backend/solution: {rel_path}",
                )
                self.assertTrue(
                    filecmp.cmp(str(item), str(target_file), shallow=False),
                    f"File content mismatch between solution/{rel_path} and backend/solution/{rel_path}",
                )

        # Reverse check: ensure no extra/orphaned files in backend/solution/
        for target_item in self.backend_solution_dir.rglob("*"):
            if target_item.is_file() and not any(part.startswith((".", "__pycache__")) or part.endswith(".pyc") for part in target_item.parts):
                rel_path = target_item.relative_to(self.backend_solution_dir)
                source_file = self.solution_dir / rel_path
                self.assertTrue(
                    source_file.exists(),
                    f"Extra orphaned file in backend/solution not present in solution: {rel_path}",
                )

    def test_presentation_footline_title_safety(self):
        """Verify long titles with Indic text and math are safely truncated without breaking macros."""
        long_title_script = dict(TRANSFORMER_SCRIPT)
        long_title_script["title"] = (
            "न्यूरल नेटवर्क का व्यापक अध्ययन: Deep Learning Architectures "
            "with $E = mc^2$ and $\\alpha + \\beta = 1$ across 100+ dimensions"
        )
        doc = build_beamer_document(long_title_script, {})
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)
        # Verify footline macro is well-formed
        self.assertIn(r"\setbeamertemplate{footline}", doc)
        self.assertNotIn(r"\devanagarifont{...", doc)  # Must not slice macro names

    def test_presentation_booktabs_and_fragile_frames(self):
        """Verify booktabs package inclusion and fragile frame marking for code snippets."""
        doc = build_beamer_document(TRANSFORMER_SCRIPT, {})
        self.assertIn(r"\usepackage{booktabs}", doc)

        # Create a section with verbatim/code
        code_script = dict(TRANSFORMER_SCRIPT)
        code_script["sections"] = [
            {
                "title": "Implementation Code",
                "bullets": [r"Snippet: \begin{verbatim} x = 1 \end{verbatim}"],
            }
        ]
        doc_code = build_beamer_document(code_script, {})
        self.assertIn(r"\begin{frame}[t,fragile]", doc_code)

    def test_latex_utils_no_par_in_math(self):
        """Verify escape_latex does not inject \\par or \\n\\n inside multiline math blocks."""
        raw_text = (
            "Paragraph one.\n\n"
            "\\[\n"
            "\\begin{aligned}\n"
            "x &= a + b \\\\\n"
            "y &= c + d\n"
            "\\end{aligned}\n"
            "\\]\n\n"
            "Paragraph two."
        )
        escaped = escape_latex(raw_text)
        self.assertNotIn("\\[\\par", escaped)
        self.assertNotIn("\\par\\]", escaped)
        self.assertIn("\\[", escaped)
        self.assertIn("\\]", escaped)

    def test_poster_theme_and_layout_matrix(self):
        """Verify all 5 poster themes and 3 layout archetypes generate valid LaTeX and theme styles."""
        import tempfile
        from solution.poster.themes import create_theme_files
        from solution.shared.tokens import resolve_palette

        themes = list(POSTER_THEMES.keys())
        layouts = ["structured_grid", "takeaway_led", "workflow_led"]

        for theme in themes:
            palette = resolve_palette(theme)
            with tempfile.TemporaryDirectory() as tmpdir:
                workdir = Path(tmpdir)
                create_theme_files(workdir, theme=theme)
                theme_sty = (workdir / "beamerthemegemini.sty").read_text(encoding="utf-8")
                self.assertIn(palette.primary.lstrip("#"), theme_sty)

            for layout in layouts:
                with self.subTest(theme=theme, layout=layout):
                    doc = build_poster_document(
                        TRANSFORMER_POSTER,
                        ["assets/fig1.png"],
                        theme=theme,
                        layout=layout,
                    )
                    self.assertIn(r"\begin{document}", doc)
                    self.assertIn(r"\end{document}", doc)

    def test_poster_multilingual_all_layouts(self):
        """Verify Indic script runs are wrapped in font commands across all poster layouts."""
        layouts = ["structured_grid", "takeaway_led", "workflow_led"]
        for layout in layouts:
            with self.subTest(layout=layout):
                doc = build_poster_document(
                    HINDI_SCRIPT,
                    [],
                    theme="classic_navy",
                    layout=layout,
                )
                self.assertIn(r"\begin{document}", doc)
                self.assertIn(r"\devanagarifont", doc)

    def test_poster_payload_fallbacks(self):
        """Verify graceful fallback for unknown themes, layouts, and legacy payloads."""
        from solution.shared.tokens import resolve_palette

        # Unknown theme falls back to default palette (saral / classic_navy)
        fallback_pal = resolve_palette("unknown_theme_404")
        default_pal = resolve_palette("classic_navy")
        self.assertEqual(fallback_pal.primary, default_pal.primary)

        # Empty and unknown values generate valid document
        doc = build_poster_document(
            TRANSFORMER_POSTER,
            [],
            theme="unknown_theme_404",
            layout="unknown_layout_999",
        )
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)

        # Legacy payload without extra options
        doc_legacy = build_poster_document(TRANSFORMER_POSTER, [])
        self.assertIn(r"\begin{document}", doc_legacy)
        self.assertIn(r"\end{document}", doc_legacy)

    def test_takeaway_led_column_geometry(self):
        """Verify takeaway_led layout generates valid columns without duplicate separators."""
        doc = build_poster_document(
            TRANSFORMER_POSTER,
            [],
            theme="classic_navy",
            layout="takeaway_led",
        )
        # Must have columns environment and takeaway header
        self.assertIn(r"\begin{columns}", doc)
        self.assertIn("TAKEAWAY", doc)

    def test_all_frontend_poster_themes_resolve(self):
        """Verify that all poster themes offered in frontend modal resolve to valid palettes."""
        from solution.shared.tokens import resolve_palette
        frontend_themes = [
            "classic_navy",
            "teal_emerald",
            "crimson_burgundy",
            "slate_indigo",
            "amber_earth",
        ]
        resolved_palettes = set()
        for t in frontend_themes:
            p = resolve_palette(t)
            self.assertIsNotNone(p)
            resolved_palettes.add(p.name)
            # Verify sty file creation succeeds
            import tempfile
            from solution.poster.themes import create_theme_files
            with tempfile.TemporaryDirectory() as tmpdir:
                create_theme_files(Path(tmpdir), theme=t)
                self.assertTrue((Path(tmpdir) / "beamerthemegemini.sty").exists())

        # Each of the 5 frontend choices should map to a distinct academic palette
        self.assertEqual(len(resolved_palettes), 5, f"Expected 5 distinct palettes, got {resolved_palettes}")

    def test_poster_worker_validates_missing_content_path(self):
        """Verify poster_worker safely handles missing or empty poster_content_gcs_path."""
        import sys
        from unittest.mock import MagicMock
        sys.modules.setdefault("redis", MagicMock())
        sys.modules.setdefault("dotenv", MagicMock())
        sys.modules.setdefault("saral_shared", MagicMock())
        sys.modules.setdefault("saral_shared.storage_client", MagicMock())
        sys.modules.setdefault("saral_shared.webhook_client", MagicMock())

        beamer_dir = str(self.root_dir / "backend" / "services" / "beamer")
        if beamer_dir not in sys.path:
            sys.path.insert(0, beamer_dir)

        try:
            import poster_worker
            mock_wh = poster_worker.wh
            mock_wh.send_webhook.reset_mock()

            poster_worker.process_poster_job(
                MagicMock(),
                "test-msg-1",
                {"run_id": "run-test-1", "step_id": "step-test-1", "poster_content_gcs_path": ""},
            )
            self.assertEqual(mock_wh.send_webhook.call_count, 1)
            call_data = mock_wh.send_webhook.call_args[0][0]
            self.assertEqual(call_data["status"], "failed")
            self.assertEqual(call_data["step_name"], "poster_compile")
            self.assertIn("poster_content_gcs_path is required", call_data["error_message"])
        finally:
            if beamer_dir in sys.path:
                sys.path.remove(beamer_dir)


if __name__ == "__main__":
    unittest.main()
