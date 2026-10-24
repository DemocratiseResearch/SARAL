"""Unit and integration tests for poster layouts, dynamic column balancing, and themes."""

import tempfile
import unittest
from pathlib import Path

from solution.poster.engine import build_poster_document
from solution.poster.themes import create_theme_files
from solution.tests.fixtures import QUALITATIVE_POSTER, TRANSFORMER_POSTER


class TestPosterArchetypes(unittest.TestCase):
    def test_structured_grid_layout_zero_images(self):
        """Dynamic column balancing test: verify Column 2 is populated when 0 images are provided."""
        doc = build_poster_document(TRANSFORMER_POSTER, [], layout="structured_grid")
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)

        # Confirm content distributed across columns
        self.assertIn("Abstract", doc)
        self.assertIn("Methodology", doc)
        self.assertIn("Key Results", doc)
        self.assertIn("Conclusion", doc)
        self.assertIn("References", doc)

        # In 0-image mode, Column 2 must contain Methodology and Results
        col_splits = doc.split(r"\begin{column}{\colwidth}")
        self.assertGreaterEqual(len(col_splits), 4, "Must have at least 3 content columns")

        # Column 2 (index 2 in col_splits) must have substantive content
        col2_content = col_splits[2]
        self.assertTrue("Methodology" in col2_content or "Results" in col2_content)

    def test_structured_grid_layout_with_images(self):
        """Verify 1-image and 2-image figure blocks."""
        doc1 = build_poster_document(TRANSFORMER_POSTER, ["assets/figure1.png"], layout="structured_grid")
        self.assertIn("assets/figure1.png", doc1)
        self.assertIn(r"\caption{Key Figure", doc1)

        doc2 = build_poster_document(
            TRANSFORMER_POSTER,
            ["assets/figure1.png", "assets/figure2.png"],
            layout="structured_grid",
        )
        self.assertIn("assets/figure1.png", doc2)
        self.assertIn("assets/figure2.png", doc2)

    def test_takeaway_led_layout(self):
        """Verify takeaway-led hero banner archetype."""
        doc = build_poster_document(TRANSFORMER_POSTER, ["assets/fig.png"], layout="takeaway_led")
        self.assertIn("CENTRAL FINDING", doc)
        self.assertIn("Primary Experimental Result", doc)
        self.assertIn("Significance", doc)

    def test_workflow_led_layout(self):
        """Verify systems/workflow-led layout archetype."""
        doc = build_poster_document(TRANSFORMER_POSTER, ["assets/fig.png"], layout="workflow_led")
        self.assertIn(r"System Pipeline \& Methodology", doc)
        self.assertIn("Empirical Evaluation", doc)
        self.assertIn("Verdict \\& Future Systems", doc)

    def test_qualitative_paper_poster(self):
        """Verify honest academic rendering of qualitative paper without numerical metrics."""
        doc = build_poster_document(QUALITATIVE_POSTER, [], layout="structured_grid")
        self.assertIn("Ethnographic Analysis of Algorithmic Governance", doc)
        self.assertIn("Elena Rostova", doc)
        self.assertIn("shadow networks", doc)
        self.assertNotIn("99.9%", doc)  # No fabricated numbers

    def test_create_theme_files_all_palettes(self):
        """Verify that create_theme_files writes valid theme and color sty files."""
        themes = ["saral", "teal_emerald", "crimson_burgundy", "slate_indigo", "amber_earth"]
        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            for theme_name in themes:
                create_theme_files(workdir, theme=theme_name)
                theme_file = workdir / "beamerthemegemini.sty"
                color_file = workdir / "beamercolorthemegemini.sty"
                self.assertTrue(theme_file.exists(), f"Missing theme sty for {theme_name}")
                self.assertTrue(color_file.exists(), f"Missing color sty for {theme_name}")
                theme_content = theme_file.read_text(encoding="utf-8")
                self.assertIn(r"\ProvidesPackage{beamerthemegemini}", theme_content)

    def test_theme_headline_uses_rule_not_tikz_fill(self):
        """Verify headline banner uses standard scoped \\rule rather than bare TikZ \\fill."""
        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            create_theme_files(workdir, theme="classic_navy")
            theme_content = (workdir / "beamerthemegemini.sty").read_text(encoding="utf-8")
            self.assertIn(r"\rule{\paperwidth}{4pt}", theme_content)
            self.assertNotIn(r"\fill[", theme_content)

    def test_color_theme_surface_color_preserved(self):
        """Verify beamercolorthemegemini defines geminisurface and does not hardcode white block body."""
        palettes_to_check = [
            ("amber_earth", "FEF3C7"),
            ("teal_emerald", "ECFDF5"),
            ("classic_navy", "F8FAFC"),
        ]
        for theme_name, expected_surface_hex in palettes_to_check:
            with tempfile.TemporaryDirectory() as tmpdir:
                workdir = Path(tmpdir)
                create_theme_files(workdir, theme=theme_name)
                color_content = (workdir / "beamercolorthemegemini.sty").read_text(encoding="utf-8")
                self.assertIn(rf"\definecolor{{geminisurface}}{{HTML}}{{{expected_surface_hex}}}", color_content)
                self.assertIn(r"\setbeamercolor{block body}{fg=black,bg=geminisurface}", color_content)
                self.assertNotIn(r"\setbeamercolor{block body}{fg=black,bg=white}", color_content)


if __name__ == "__main__":
    unittest.main()
