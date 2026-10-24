"""Unit tests for LaTeX mathematical notation preservation and safe escaping."""

import unittest
from solution.shared.latex_utils import escape_latex, normalise_bullets


class TestMathPreservation(unittest.TestCase):
    def test_inline_math_preserved(self):
        """Ensure $...$ math expressions are NOT escaped or broken."""
        sample = "The computational complexity is $O(n \\log n)$ and precision $\\alpha = 0.05$."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn("$O(n \\log n)$", escaped)
        self.assertIn("$\\alpha = 0.05$", escaped)
        self.assertNotIn(r"\$", escaped)

    def test_equation_superscripts_and_subscripts(self):
        """Ensure superscripts (^) and subscripts (_) inside math are untouched."""
        sample = "Attention formula is $\\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn("QK^T", escaped)
        self.assertIn("\\sqrt{d_k}", escaped)
        self.assertNotIn(r"\textasciicircum{}", escaped)

    def test_display_math_preserved(self):
        """Ensure display equations \\[ ... \\] are preserved."""
        sample = "The loss function is \\[ \\mathcal{L} = \\sum_{i=1}^N (y_i - \\hat{y}_i)^2 \\]."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn("\\[ \\mathcal{L} = \\sum_{i=1}^N (y_i - \\hat{y}_i)^2 \\]", escaped)

    def test_plain_text_specials_escaped(self):
        """Ensure ordinary text specials (&, %, _, #) are correctly escaped."""
        sample = "Research & Development achieved 99.5% accuracy on user_id_test with #1 ranking."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn(r"\&", escaped)
        self.assertIn(r"\%", escaped)
        self.assertIn(r"\_", escaped)
        self.assertIn(r"\#", escaped)

    def test_currency_dollars_escaped(self):
        """Ensure currency dollar signs (e.g. $100, $5.5B) are escaped as \\$."""
        sample = "Training compute cost exceeded $100M with savings of $25.5K."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn(r"\$100M", escaped)
        self.assertIn(r"\$25.5K", escaped)

    def test_currency_and_math_in_same_sentence(self):
        """Ensure currency amounts and inline math formulas coexist without delimiter pairing corruption."""
        sample = "We spent $500 to compute $O(n^2)$ matrix operations with profit of $1.2M."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn(r"\$500", escaped)
        self.assertIn(r"$O(n^2)$", escaped)
        self.assertIn(r"\$1.2M", escaped)
        self.assertNotIn(r"\textbackslash{}$500", escaped)

    def test_literal_dollar_in_prose(self):
        """Ensure literal unmatched dollar signs in prose are safely escaped."""
        sample = "Price is $50 vs $75 per unit, not $ free."
        escaped = escape_latex(sample, preserve_math=True)
        self.assertIn(r"\$50", escaped)
        self.assertIn(r"\$75", escaped)
        self.assertIn(r"\$ free", escaped)

    def test_dangerous_commands_disarmed(self):
        """Ensure malicious commands like \\write18 or \\input are disarmed."""
        malicious = "Testing \\write18{rm -rf /} and \\input{/etc/passwd} in title."
        escaped = escape_latex(malicious, preserve_math=True)
        self.assertNotIn(r"\write18{", escaped)
        self.assertIn(r"\w\{\}rite18", escaped)
        self.assertIn(r"\i\{\}nput", escaped)

    def test_normalise_bullets_preserves_math(self):
        """Ensure bullet normalizer cleans whitespace while preserving math."""
        bullets = [
            "  First finding has $p < 0.001$ significance.  ",
            "Model parameters scale as $10^9$ with 15% improvement.",
        ]
        norm = normalise_bullets(bullets, preserve_math=True)
        self.assertEqual(len(norm), 2)
        self.assertIn("$p < 0.001$", norm[0])
        self.assertIn("$10^9$", norm[1])
        self.assertIn(r"15\%", norm[1])


if __name__ == "__main__":
    unittest.main()
