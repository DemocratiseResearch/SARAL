"""Unit and integration tests for presentation slide archetypes and theme rendering."""

import unittest
from solution.presentation.archetypes import SlideArchetype, classify_slide
from solution.presentation.engine import BEAMER_THEMES, build_beamer_document
from solution.tests.fixtures import SPARSE_SCRIPT, TRANSFORMER_SCRIPT


class TestPresentationArchetypes(unittest.TestCase):
    def test_archetype_classification(self):
        """Verify accurate semantic categorization of slide titles."""
        self.assertEqual(classify_slide("Problem & Motivation", []), SlideArchetype.PROBLEM)
        self.assertEqual(classify_slide("Core Research Question", []), SlideArchetype.QUESTION)
        self.assertEqual(classify_slide("Methodology & System Pipeline", []), SlideArchetype.METHODOLOGY)
        self.assertEqual(classify_slide("Experimental Results & Metrics", []), SlideArchetype.RESULTS)
        self.assertEqual(classify_slide("Comparative Evaluation vs Baselines", []), SlideArchetype.COMPARISON)
        self.assertEqual(classify_slide("Limitations & Future Work", []), SlideArchetype.LIMITATIONS)
        self.assertEqual(classify_slide("Conclusion & Final Verdict", []), SlideArchetype.CONCLUSION)
        self.assertEqual(classify_slide("Additional Remarks", []), SlideArchetype.GENERAL)

    def test_build_beamer_document_transformer_script(self):
        """Verify complete presentation compilation with Transformer research paper."""
        doc = build_beamer_document(TRANSFORMER_SCRIPT, {}, theme="saral")
        self.assertIn(r"\documentclass[aspectratio=169,10pt]{beamer}", doc)
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)

        # Title slide elements
        self.assertIn("RESEARCH DEFENSE", doc)
        self.assertIn("Attention Is All You Need", doc)
        self.assertIn("Ashish Vaswani", doc)

        # Content archetype environments present
        self.assertIn("saralcard", doc)
        self.assertIn("saralalertcard", doc)
        self.assertIn("saralaccentcard", doc)

        # Math preserved inside slides
        self.assertIn("$O(n)$", doc)
        self.assertIn("QK^T", doc)

        # Speaker notes preserved
        self.assertIn(r"\note{", doc)

    def test_all_five_beamer_themes(self):
        """Ensure every exposed Beamer theme compiles without syntax errors."""
        themes = ["saral", "metropolis", "berkeley", "cambridgeus", "paloalto"]
        for theme_name in themes:
            doc = build_beamer_document(TRANSFORMER_SCRIPT, {}, theme=theme_name)
            self.assertTrue(len(doc) > 500, f"Theme {theme_name} generated too short document")
            self.assertIn(r"\begin{document}", doc)
            self.assertIn(r"\end{document}", doc)

    def test_sparse_script_edge_case(self):
        """Ensure sparse input (no authors, 1 section) renders cleanly without crashing."""
        doc = build_beamer_document(SPARSE_SCRIPT, {}, theme="saral")
        self.assertIn("A Preliminary Note on Quantum Walks", doc)
        self.assertIn("Quantum walks exhibit quadratic speedup", doc)

    def test_assigned_image_rendering(self):
        """Ensure assigned images generate framed figure blocks."""
        assignments = {"sec_method": "figures/arch_diagram.png"}
        doc = build_beamer_document(TRANSFORMER_SCRIPT, assignments, theme="saral")
        self.assertIn("figures/arch_diagram.png", doc)
        self.assertIn(r"\includegraphics", doc)
        self.assertIn("saralframebox", doc)


if __name__ == "__main__":
    unittest.main()
