import re
import unicodedata


def extract_text_from_tex(tex_content: str) -> str:
    # Keep only the document body if the delimiters are present.
    m = re.search(r"\\begin\{document\}(.*?)\\end\{document\}", tex_content, re.DOTALL)
    if m:
        tex_content = m.group(1)

    # Drop comment lines (% at start of a line or after whitespace).
    tex_content = re.sub(r"(?m)^\s*%.*$", "", tex_content)

    # Remove LaTeX commands with optional arguments: \cmd{...}, \cmd[opt]{...}
    tex_content = re.sub(r"\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^{}]*\})?", " ", tex_content)

    # Dangling braces from nested commands.
    tex_content = re.sub(r"\{|\}", " ", tex_content)

    # Collapse whitespace.
    tex_content = re.sub(r"\s+", " ", tex_content).strip()

    return tex_content


def clean_text(text: str) -> str:
    """Normalize Unicode quirks that break Gemini's JSON output."""
    if not text:
        return ""

    # Smart quotes → ASCII
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2018", "'").replace("\u2019", "'")

    # En/em dashes → hyphen
    text = text.replace("\u2013", "-").replace("\u2014", "-")

    # NFKD normalization flattens ligatures + combining chars.
    text = unicodedata.normalize("NFKD", text)

    return text


def load_and_clean(text_bytes: bytes) -> str:
    text = text_bytes.decode("utf-8", errors="replace")
    if "\\begin{document}" in text or "\\documentclass" in text:
        text = extract_text_from_tex(text)
    return clean_text(text)
