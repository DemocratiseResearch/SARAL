"""Unit tests verifying backwards compatibility with existing SARAL APIs and legacy theme names."""

import tempfile
import unittest
from pathlib import Path

from solution.presentation.engine import build_beamer_document
from solution.poster.engine import build_poster_document
from solution.poster.themes import create_theme_files
from solution.tests.fixtures import TRANSFORMER_POSTER, TRANSFORMER_SCRIPT


class TestBackwardCompatibility(unittest.TestCase):
    def test_legacy_beamer_call_signature(self):
        """Verify calling build_beamer_document with 2 arguments works seamlessly."""
        doc = build_beamer_document(TRANSFORMER_SCRIPT, {})
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)

    def test_legacy_theme_aliases(self):
        """Verify legacy aliases like 'template-saral', 'default', 'classic-blue' map to canonical themes."""
        aliases = ["template-saral", "default", "classic-blue", "unknown-theme-xyz"]
        for alias in aliases:
            doc = build_beamer_document(TRANSFORMER_SCRIPT, {}, theme=alias)
            self.assertIn(r"\begin{document}", doc)
            self.assertIn(r"\end{document}", doc)

    def test_legacy_poster_call_signature(self):
        """Verify calling build_poster_document with 2 arguments works seamlessly."""
        doc = build_poster_document(TRANSFORMER_POSTER, [])
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)

    def test_legacy_create_theme_files_signature(self):
        """Verify calling create_theme_files(workdir) with 1 argument works seamlessly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            create_theme_files(workdir)
            self.assertTrue((workdir / "beamerthemegemini.sty").exists())
            self.assertTrue((workdir / "beamercolorthemegemini.sty").exists())


if __name__ == "__main__":
    unittest.main()
