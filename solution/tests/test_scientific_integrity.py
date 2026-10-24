"""Unit tests verifying scientific integrity and prevention of fabricated content."""

import unittest
from solution.presentation.engine import build_beamer_document
from solution.poster.engine import build_poster_document
from solution.tests.fixtures import QUALITATIVE_POSTER, SPARSE_SCRIPT


class TestScientificIntegrity(unittest.TestCase):
    def test_no_fabricated_metrics_in_qualitative_poster(self):
        """Verify that papers without empirical metrics do not have fake stats added."""
        doc = build_poster_document(QUALITATIVE_POSTER, [], layout="structured_grid")

        # Verify no manufactured percentage gains or fake p-values
        banned_fakes = ["99.9%", "+45% improvement", "p < 0.001", "accuracy of 98%", "SOTA metric: 95%"]
        for fake in banned_fakes:
            self.assertNotIn(fake, doc, f"Fabricated metric found: {fake}")

    def test_no_fabricated_affiliations_in_sparse_presentation(self):
        """Verify that papers without authors/affiliations do not inject fake universities."""
        doc = build_beamer_document(SPARSE_SCRIPT, {}, theme="saral")

        # Check for fake institutions
        fake_orgs = ["Harvard University", "MIT CSAIL", "Stanford University", "Oxford University"]
        for fake in fake_orgs:
            self.assertNotIn(fake, doc, f"Fabricated affiliation found: {fake}")

    def test_no_fake_qr_codes_or_promotional_urls(self):
        """Ensure no phantom QR codes or unverified promotional URLs are rendered."""
        doc = build_poster_document(QUALITATIVE_POSTER, [], layout="takeaway_led")
        self.assertNotIn(r"\qrcode", doc)
        self.assertNotIn("https://fake-demo-link.edu", doc)

    def test_honest_handling_of_missing_references(self):
        """Ensure missing references or optional blocks omit gracefully rather than faking citations."""
        no_refs_poster = {
            "title": "Theoretical Bounds on Convex Optimization",
            "authors": "Jane Doe",
            "abstract": "We analyze primal-dual interior point methods.",
            "introduction": ["Convex optimization plays a central role in machine learning."],
            "methodology": ["Newton-Raphson iterations with adaptive step sizing."],
            "results": ["Linear convergence under strong convexity."],
            "conclusion": ["Optimal convergence rate established."],
            # 'references' key intentionally omitted
        }
        doc = build_poster_document(no_refs_poster, [], layout="structured_grid")
        self.assertIn(r"\begin{document}", doc)
        self.assertNotIn(r"\begin{block}{References}", doc)


if __name__ == "__main__":
    unittest.main()
