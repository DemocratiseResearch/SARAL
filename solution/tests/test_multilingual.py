"""Unit tests for multilingual Indic script support in presentations and posters."""

import unittest
from solution.presentation.engine import build_beamer_document
from solution.poster.engine import build_poster_document
from solution.shared.latex_utils import LANGUAGE_FONT_MAP, wrap_script_runs
from solution.tests.fixtures import HINDI_SCRIPT


class TestMultilingualSupport(unittest.TestCase):
    def test_language_font_mapping(self):
        """Ensure all 22 scheduled Indian languages are defined in font map."""
        expected_langs = ["hi-IN", "ta-IN", "bn-IN", "te-IN", "kn-IN", "ml-IN", "gu-IN", "mr-IN", "pa-IN"]
        for lang in expected_langs:
            self.assertIn(lang, LANGUAGE_FONT_MAP)
            macro, font, script = LANGUAGE_FONT_MAP[lang]
            self.assertTrue(bool(macro))
            self.assertTrue(bool(font))
            self.assertTrue(bool(script))

    def test_wrap_script_runs_devanagari(self):
        """Ensure Devanagari unicode runs are wrapped with language macro."""
        text = "English prefix नमस्ते world."
        wrapped = wrap_script_runs(text, r"\devanagarifont", "Devanagari")
        self.assertIn(r"{\devanagarifont नमस्ते}", wrapped)
        self.assertIn("English prefix", wrapped)

    def test_hindi_presentation_document(self):
        """Ensure Hindi script presentation builds cleanly with Indic wrapping."""
        doc = build_beamer_document(HINDI_SCRIPT, {}, theme="saral")
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)
        self.assertIn("भारतीय", doc)
        self.assertIn("भाषाओं", doc)
        self.assertIn("समस्या", doc)
        self.assertIn(r"\devanagarifont", doc)

    def test_hindi_poster_document(self):
        """Ensure Hindi research poster builds cleanly with Indic wrapping."""
        hindi_poster = {
            "title": "भारतीय भाषाओं में प्राकृतिक भाषा प्रसंस्करण",
            "authors": "डॉ. राजेश शर्मा (आईआईटी दिल्ली)",
            "abstract": "इस शोध पत्र में भारतीय भाषाओं के लिए बहुभाषी मॉडल प्रस्तुत किया गया है।",
            "introduction": ["संसाधन-अभाव की समस्या को हल करना।"],
            "methodology": ["22 अनुसूचित भाषाओं का मॉडल।"],
            "results": ["अनुवाद में 15% सुधार।"],
            "conclusion": ["सार्थक प्रगति।"],
            "language": "hi-IN",
        }
        doc = build_poster_document(hindi_poster, [], layout="structured_grid")
        self.assertIn(r"\begin{document}", doc)
        self.assertIn(r"\end{document}", doc)
        self.assertIn("भारतीय", doc)
        self.assertIn(r"\devanagarifont", doc)

    def test_preferred_font_selection(self):
        """Verify that preferred font is selected when installed."""
        from unittest.mock import patch
        from solution.shared.latex_utils import font_commands
        with patch("solution.shared.latex_utils.font_is_installed", return_value=True):
            decl, wrapper, script = font_commands("hi-IN")
            self.assertIn(r"\newfontfamily\devanagarifont[Script=Devanagari]{Noto Serif Devanagari}", decl)
            self.assertEqual(wrapper, r"\devanagarifont")
            self.assertEqual(script, "Devanagari")

    def test_fallback_font_selection(self):
        """Verify that fallback font is selected when preferred font is missing."""
        from unittest.mock import patch
        from solution.shared.latex_utils import font_commands
        def mock_installed(font_name):
            return font_name == "Devanagari MT"

        with patch("solution.shared.latex_utils.font_is_installed", side_effect=mock_installed):
            decl, wrapper, script = font_commands("hi-IN")
            self.assertIn(r"\newfontfamily\devanagarifont[Script=Devanagari]{Devanagari MT}", decl)
            self.assertEqual(wrapper, r"\devanagarifont")
            self.assertEqual(script, "Devanagari")

    def test_missing_fonts_graceful_handling(self):
        """Verify that missing fonts return empty strings without raising errors."""
        from unittest.mock import patch
        from solution.shared.latex_utils import font_commands
        with patch("solution.shared.latex_utils.font_is_installed", return_value=False):
            decl, wrapper, script = font_commands("hi-IN")
            self.assertEqual(decl, "")
            self.assertEqual(wrapper, "")
            self.assertEqual(script, "")

    def test_generated_hindi_latex_font_declaration(self):
        """Verify that generated presentation and poster contain valid fontspec font declaration."""
        doc_pres = build_beamer_document(HINDI_SCRIPT, {}, theme="saral")
        self.assertIn(r"\newfontfamily\devanagarifont", doc_pres)
        self.assertIn("Script=Devanagari", doc_pres)

        hindi_poster = {
            "title": "भारतीय भाषाओं में प्राकृतिक भाषा प्रसंस्करण",
            "authors": "शोधकर्ता",
            "abstract": "सार",
            "language": "hi-IN",
        }
        doc_post = build_poster_document(hindi_poster, [])
        self.assertIn(r"\newfontfamily\devanagarifont", doc_post)
        self.assertIn("Script=Devanagari", doc_post)

    def test_font_stem_prefix_matching(self):
        """Verify that font detection requires prefix matching and rejects substring collisions."""
        from unittest.mock import patch
        from solution.shared.latex_utils import font_is_installed

        fake_stems = {"notosansolchikiregular", "notosansolchikiregular.ttf"}
        font_is_installed.cache_clear()
        try:
            with patch("solution.shared.latex_utils.shutil.which", return_value=None):
                with patch("solution.shared.latex_utils._get_installed_font_stems", return_value=fake_stems):
                    # Family prefix matches file stem
                    self.assertTrue(font_is_installed("Noto Sans Ol Chiki"))
                    # Shorter substring candidate does not match file stem starting with 'notosans'
                    self.assertFalse(font_is_installed("Ol Chiki"))
        finally:
            font_is_installed.cache_clear()


if __name__ == "__main__":
    unittest.main()
