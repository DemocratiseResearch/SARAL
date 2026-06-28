from __future__ import annotations

import io
import re
from datetime import datetime
from urllib.parse import urlparse

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    HRFlowable,
    KeepInFrame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)


_TITLE_KEY = "Title"
_TAKEAWAYS_KEY = "Key Takeaways"

_PAGE1_LEFT_SECTIONS = [
    "Executive Summary",
    "Business Problem Addressed",
]

# Sections that flow on page 2+ (single column).
_INNER_SECTIONS = [
    "Technical Innovation Summary",
    "Business Impact",
    "Commercial Applications",
    "Implementation Considerations",
    "Risks and Limitations",
    "Strategic Recommendations",
]

# Brand palette — warm cream + navy + amber, matches the Saral landing.
_LINEN = colors.HexColor("#f5f4f0")
_LINEN_DARK = colors.HexColor("#ede9e2")
_NAVY = colors.HexColor("#0f2741")
_NAVY_SOFT = colors.HexColor("#1c3859")
_AMBER = colors.HexColor("#d97706")
_AMBER_SOFT = colors.HexColor("#fbbf24")
_INK = colors.HexColor("#1f2937")
_INK_MUTED = colors.HexColor("#6b7280")
_INK_FAINT = colors.HexColor("#9ca3af")
_RULE = colors.HexColor("#e5e7eb")

# Companies frequently mentioned in BB outputs — auto-bolded if present.
_KNOWN_COMPANIES = [
    "Watson OpenScale", "DataRobot", "H2O.ai", "Fiddler AI", "Arthur AI",
    "Seldon", "IBM", "Microsoft", "Google", "Writer", "Fluree",
    "Stardog", "Neo4j", "Siemens", "Accenture", "OpenAI", "Anthropic",
    "Hugging Face", "AWS", "Azure", "Databricks", "Snowflake",
    "Salesforce", "ServiceNow", "Oracle", "SAP", "Meta", "NVIDIA",
    "Cohere", "Mistral", "Perplexity",
]
_COMPANY_RE = re.compile(
    r"(?<![A-Za-z0-9])(" + "|".join(re.escape(c) for c in _KNOWN_COMPANIES) + r")(?![A-Za-z0-9])"
)
_STAT_PATTERNS = [
    re.compile(r"(USD\s*\$?\d[\d,.]*\s*(?:billion|million|trillion|B|M|T)\b)", re.IGNORECASE),
    re.compile(r"(\$\s*\d[\d,.]*\s*(?:billion|million|trillion|B|M|T)\b)", re.IGNORECASE),
    re.compile(r"(\$\s*\d[\d,.]+(?![\d,.]))"),
    re.compile(r"(\d+(?:\.\d+)?\s*%(?:\s*CAGR)?)"),
]
_EMPHASIS_STARTERS = (
    "We recommend", "Our recommendation",
    "The primary risk", "The primary opportunity",
    "Our position",
)


# ── Styles ────────────────────────────────────────────────────────────────


def _build_styles() -> dict:
    base = getSampleStyleSheet()
    s: dict = {}

    s["wordmark"] = ParagraphStyle(
        "wordmark", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=18, leading=20,
        textColor=_NAVY, spaceAfter=0,
    )
    s["wordmark_sub"] = ParagraphStyle(
        "wordmark_sub", parent=base["Normal"],
        fontName="Helvetica", fontSize=8, leading=10,
        textColor=_INK_MUTED, spaceAfter=0,
    )
    s["meta_tag"] = ParagraphStyle(
        "meta_tag", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, leading=12,
        textColor=_AMBER, spaceAfter=2, alignment=2,  # right
    )
    s["meta_label"] = ParagraphStyle(
        "meta_label", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, leading=13,
        textColor=_NAVY, spaceAfter=0, alignment=2,
    )
    s["meta_date"] = ParagraphStyle(
        "meta_date", parent=base["Normal"],
        fontName="Helvetica", fontSize=9, leading=11,
        textColor=_INK_MUTED, spaceAfter=0, alignment=2,
    )

    s["doc_tag_inline"] = ParagraphStyle(
        "doc_tag_inline", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=9, leading=11,
        textColor=_AMBER, spaceAfter=4,
    )
    s["paper_title"] = ParagraphStyle(
        "paper_title", parent=base["Title"],
        fontName="Times-Bold", fontSize=22, leading=26,
        textColor=_NAVY, spaceBefore=2, spaceAfter=6, alignment=0,
    )
    # Mid-length titles (60-100 chars).
    s["paper_title_md"] = ParagraphStyle(
        "paper_title_md", parent=s["paper_title"],
        fontSize=18, leading=22,
    )
    # Long titles (>100 chars).
    s["paper_title_sm"] = ParagraphStyle(
        "paper_title_sm", parent=s["paper_title"],
        fontSize=15, leading=19,
    )
    s["thesis"] = ParagraphStyle(
        "thesis", parent=base["Normal"],
        fontName="Times-Italic", fontSize=12, leading=15,
        textColor=_NAVY_SOFT, spaceAfter=14,
    )
    s["section_label"] = ParagraphStyle(
        "section_label", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=11.5, leading=14,
        textColor=_NAVY, spaceBefore=10, spaceAfter=5,
    )
    s["body"] = ParagraphStyle(
        "body", parent=base["Normal"],
        fontName="Helvetica", fontSize=9.5, leading=13.5,
        textColor=_INK, spaceAfter=6, alignment=4,  # justify
    )
    s["bullet"] = ParagraphStyle(
        "bullet", parent=s["body"],
        leftIndent=12, firstLineIndent=0,
        spaceBefore=1, spaceAfter=3, alignment=0,
    )

    # Right sidebar (Key Takeaways)
    s["takeaways_label"] = ParagraphStyle(
        "takeaways_label", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=12, leading=14,
        textColor=_AMBER, spaceAfter=10,
    )
    s["takeaway_item"] = ParagraphStyle(
        "takeaway_item", parent=base["Normal"],
        fontName="Helvetica", fontSize=9, leading=12.5,
        textColor=_NAVY_SOFT, spaceAfter=6, alignment=0,
    )

    # Sources
    s["sources_heading"] = ParagraphStyle(
        "sources_heading", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=_NAVY, spaceBefore=10, spaceAfter=4,
    )
    s["source_item"] = ParagraphStyle(
        "source_item", parent=base["Normal"],
        fontName="Helvetica", fontSize=8, leading=11,
        textColor=_INK_MUTED, spaceAfter=2,
    )
    return s


# ── Text helpers ──────────────────────────────────────────────────────────


def _xml_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


_MD_BOLD_RE = re.compile(r"\*\*([^*\n]+?)\*\*")
_MD_ITALIC_RE = re.compile(r"(?<!\*)\*([^*\n]+?)\*(?!\*)")
_BOLD_SPAN_RE = re.compile(r"<b>.*?</b>", re.DOTALL)


def _apply_outside_bold(text: str, sub_fn) -> str:

    out_parts: list[str] = []
    last_end = 0
    for m in _BOLD_SPAN_RE.finditer(text):
        out_parts.append(sub_fn(text[last_end : m.start()]))
        out_parts.append(m.group(0))  # leave the bold span untouched
        last_end = m.end()
    out_parts.append(sub_fn(text[last_end:]))
    return "".join(out_parts)


def _decorate(safe_text: str) -> str:

    out = _MD_BOLD_RE.sub(r"<b>\1</b>", safe_text)
    out = _MD_ITALIC_RE.sub(r"<i>\1</i>", out)

    # Apply each stat pattern one at a time, re-running the outside-bold
    # guard between them — otherwise a longer match (e.g. "$143.09 billion")
    # gets re-wrapped by a shorter sibling pattern (e.g. "$143.09").
    for pat in _STAT_PATTERNS:
        out = _apply_outside_bold(out, lambda seg, _p=pat: _p.sub(r"<b>\1</b>", seg))
    out = _apply_outside_bold(out, lambda seg: _COMPANY_RE.sub(r"<b>\1</b>", seg))
    return out


def _maybe_italicize(safe_text: str) -> str:
    for starter in _EMPHASIS_STARTERS:
        if safe_text.startswith(starter):
            return f'<i><font color="#0f2741">{safe_text}</font></i>'
    return safe_text


# ── Sources extraction ────────────────────────────────────────────────────


_SOURCE_LINE_RE = re.compile(r"^\s*\[(\d+)\]\s+(.+?)\s*$")
_SOURCES_TRAILER_RE = re.compile(r"\n\s*Sources\s*\n", re.IGNORECASE)


def _extract_sources_from_text(text: str) -> tuple[str, list[tuple[str, str]]]:
    """Pull a trailing 'Sources' block out of section text."""
    m = _SOURCES_TRAILER_RE.search(text)
    if not m:
        return text, []
    body = text[: m.start()].rstrip()
    trailer = text[m.end() :]
    sources: list[tuple[str, str]] = []
    current_label = ""
    for raw_line in trailer.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _SOURCE_LINE_RE.match(line)
        if match:
            current_label = match.group(2).strip()
            if current_label.startswith("http"):
                sources.append((_clean_domain(current_label), current_label))
                current_label = ""
            continue
        if line.startswith("http"):
            label = current_label or _clean_domain(line)
            sources.append((label, line))
            current_label = ""
    return body, sources


def _clean_domain(url: str) -> str:
    try:
        host = urlparse(url).netloc
    except Exception:
        return url
    if host.startswith("www."):
        host = host[4:]
    return host or url


# ── Section rendering ─────────────────────────────────────────────────────


def _render_body_text(text: str, styles: dict) -> list:
    """Split a section string into Paragraph flowables."""
    flowables: list = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            flowables.append(Spacer(1, 3))
            continue
        safe = _xml_escape(line)
        if safe.startswith("•"):
            content = _decorate(safe[1:].strip())
            flowables.append(Paragraph(f"&bull;&nbsp;&nbsp;{content}", styles["bullet"]))
        else:
            decorated = _decorate(safe)
            decorated = _maybe_italicize(decorated)
            flowables.append(Paragraph(decorated, styles["body"]))
    return flowables


def _render_takeaways(raw: str, styles: dict) -> list:

    flowables: list = [Paragraph("Key Takeaways", styles["takeaways_label"])]
    bullets = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading bullet/dash markers
        line = re.sub(r"^[•\-\*]\s*", "", line).strip()
        if line:
            bullets.append(line)
    for i, bullet in enumerate(bullets):
        safe = _decorate(_xml_escape(bullet))
        flowables.append(Paragraph(safe, styles["takeaway_item"]))
        if i < len(bullets) - 1:
            flowables.append(HRFlowable(
                width="100%", thickness=0.4, color=_INK_FAINT,
                dash=(1, 2), spaceBefore=2, spaceAfter=4,
            ))
    return flowables


def _render_section_with_label(label: str, text: str, styles: dict) -> list:
    """Section heading + body. Heading gets an amber leading dot."""
    body, sources = _extract_sources_from_text(text)
    # Amber bullet glyph + label; the &bull; renders as a solid dot.
    label_html = (
        f'<font color="#d97706">&#9632;&nbsp;&nbsp;</font>'
        f'<font color="#0f2741">{_xml_escape(label)}</font>'
    )
    flowables: list = [Paragraph(label_html, styles["section_label"])]
    flowables.extend(_render_body_text(body, styles))
    if sources:
        flowables.extend(_render_sources(sources, styles))
    return flowables


def _render_sources(sources: list[tuple[str, str]], styles: dict) -> list:
    if not sources:
        return []
    flowables: list = [
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=0.5, color=_RULE),
        Paragraph("SOURCES", styles["sources_heading"]),
    ]
    for i, (label, url) in enumerate(sources, start=1):
        clean = _xml_escape(label)
        url_safe = _xml_escape(url)
        flowables.append(
            Paragraph(
                f'[{i}]&nbsp;<a href="{url_safe}" color="#0f2741"><u>{clean}</u></a>',
                styles["source_item"],
            )
        )
    return flowables


# ── Page chrome (drawn directly on canvas) ───────────────────────────────


def _draw_branded_header_band(canvas, doc, paper_title: str, date_str: str):

    page_w, page_h = A4
    band_h = 4.4 * cm

    # Linen band
    canvas.saveState()
    canvas.setFillColor(_LINEN)
    canvas.rect(0, page_h - band_h, page_w, band_h, fill=1, stroke=0)

    # Wordmark left
    canvas.setFillColor(_NAVY)
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawString(2.0 * cm, page_h - 1.6 * cm, "SARAL AI")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(_INK_MUTED)
    # canvas.drawString(2.0 * cm, page_h - 2.1 * cm, "Research → Decisions")
    # canvas.drawString(2.0 * cm, page_h - 2.5 * cm, "saral.ai")

    # Right meta block
    right_x = page_w - 2.0 * cm
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(_AMBER)
    canvas.drawRightString(right_x, page_h - 1.6 * cm, "BUSINESS BRIEF")
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(_NAVY)
    canvas.drawRightString(right_x, page_h - 2.1 * cm, "Saral AI · Insights")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(_INK_MUTED)
    canvas.drawRightString(right_x, page_h - 2.55 * cm, date_str)

    # Decorative stripe motif — three offset bars in amber/navy
    stripe_y = page_h - band_h + 0.55 * cm
    canvas.setLineCap(1)  # rounded ends
    bar_specs = [
        # (x_start_cm, length_cm, y_offset_pt, color, thickness)
        (10.0, 9.0, 14, _AMBER, 4),
        (8.5, 10.5, 7, _NAVY, 4),
        (11.5, 7.5, 0, _AMBER_SOFT, 4),
        (7.0, 6.0, -7, _NAVY_SOFT, 4),
    ]
    for x_cm, len_cm, y_off, color, thick in bar_specs:
        canvas.setStrokeColor(color)
        canvas.setLineWidth(thick)
        y = stripe_y + y_off
        canvas.line(x_cm * cm, y, (x_cm + len_cm) * cm, y)

    canvas.restoreState()


def _draw_page_footer(canvas, doc, total_label: str = ""):

    page_w, _ = A4
    canvas.saveState()
    canvas.setStrokeColor(_RULE)
    canvas.setLineWidth(0.5)
    canvas.line(2.0 * cm, 1.5 * cm, page_w - 2.0 * cm, 1.5 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(_INK_FAINT)
    # canvas.drawString(2.0 * cm, 1.1 * cm, "saral.ai · Business Brief")
    canvas.drawRightString(page_w - 2.0 * cm, 1.1 * cm, f"Page {doc.page}")
    canvas.restoreState()


def _draw_inner_header_strip(canvas, doc, paper_title_short: str):

    page_w, page_h = A4
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.setFillColor(_NAVY)
    canvas.drawString(2.0 * cm, page_h - 1.2 * cm, "SARAL AI  ·  BUSINESS BRIEF")
    canvas.setFont("Helvetica-Oblique", 8.5)
    canvas.setFillColor(_INK_MUTED)
    canvas.drawRightString(page_w - 2.0 * cm, page_h - 1.2 * cm, paper_title_short)
    canvas.setStrokeColor(_RULE)
    canvas.setLineWidth(0.5)
    canvas.line(2.0 * cm, page_h - 1.4 * cm, page_w - 2.0 * cm, page_h - 1.4 * cm)
    canvas.restoreState()


# ── Doc template ─────────────────────────────────────────────────────────


class _BriefDocTemplate(BaseDocTemplate):
    def __init__(self, buf, paper_title: str, date_str: str, **kwargs):
        super().__init__(buf, **kwargs)
        self._paper_title = paper_title
        self._paper_title_short = (paper_title[:80] + "…") if len(paper_title) > 80 else paper_title
        self._date_str = date_str

        page_w, page_h = A4
        # Page 1 layout: header band (4.4cm) at top, then 2-col body region.
        band_h = 4.4 * cm
        gap_below_band = 0.6 * cm
        body_top_y = page_h - band_h - gap_below_band
        bottom_margin = 2.0 * cm
        body_h = body_top_y - bottom_margin

        left_w = (page_w - 4.0 * cm) * 0.62
        gap_w = (page_w - 4.0 * cm) * 0.04
        right_w = (page_w - 4.0 * cm) * 0.34

        cover_left = Frame(
            2.0 * cm, bottom_margin, left_w, body_h,
            id="cover_left", showBoundary=0,
            leftPadding=0, rightPadding=8, topPadding=0, bottomPadding=0,
        )
        cover_right = Frame(
            2.0 * cm + left_w + gap_w, bottom_margin, right_w, body_h,
            id="cover_right", showBoundary=0,
            leftPadding=10, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        # Inner page: single full-width frame, top-bound by header strip.
        inner = Frame(
            2.0 * cm, bottom_margin,
            page_w - 4.0 * cm, page_h - 1.7 * cm - bottom_margin,
            id="inner", showBoundary=0,
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )

        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_left, cover_right],
                         onPage=self._on_cover_page),
            PageTemplate(id="inner", frames=[inner],
                         onPage=self._on_inner_page),
        ])

    def _on_cover_page(self, canvas, doc):
        _draw_branded_header_band(canvas, doc, self._paper_title, self._date_str)
        _draw_page_footer(canvas, doc)

    def _on_inner_page(self, canvas, doc):
        _draw_inner_header_strip(canvas, doc, self._paper_title_short)
        _draw_page_footer(canvas, doc)


# ── Top-level renderer ───────────────────────────────────────────────────


def render_business_brief_pdf(sections: dict, paper_title: str = "Research Paper") -> bytes:
    buf = io.BytesIO()
    date_str = datetime.now().strftime("%B %Y")
    doc = _BriefDocTemplate(
        buf,
        paper_title=paper_title,
        date_str=date_str,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.0 * cm,
        title="Business Brief — Saral AI",
        author="Saral AI",
    )
    styles = _build_styles()
    story: list = []


    page_w, page_h = A4
    band_h = 4.4 * cm
    gap_below_band = 0.6 * cm
    body_top_y = page_h - band_h - gap_below_band
    bottom_margin = 2.0 * cm
    body_h = body_top_y - bottom_margin
    left_w = (page_w - 4.0 * cm) * 0.62
    right_w = (page_w - 4.0 * cm) * 0.34

    safe_title = _xml_escape(paper_title)


    title_len = len(paper_title)
    if title_len <= 60:
        title_style = styles["paper_title"]
    elif title_len <= 100:
        title_style = styles["paper_title_md"]
    else:
        title_style = styles["paper_title_sm"]

    left_block: list = [
        Paragraph("BUSINESS BRIEF", styles["doc_tag_inline"]),
        Paragraph(safe_title, title_style),
    ]

    # Optional thesis (Title field from the LLM)
    thesis = sections.get(_TITLE_KEY, "").strip()
    if thesis:
        thesis = thesis.strip('"“”')
        safe_thesis = _decorate(_xml_escape(thesis))
        left_block.append(Paragraph(safe_thesis, styles["thesis"]))

    for title in _PAGE1_LEFT_SECTIONS:
        content = sections.get(title, "").strip()
        if not content:
            continue
        left_block.extend(_render_section_with_label(title, content, styles))


    story.append(KeepInFrame(
        maxWidth=left_w - 8,  # account for frame rightPadding
        maxHeight=body_h,
        content=left_block,
        mode="shrink",  # auto-shrink font to fit; safer than truncation
    ))

    # ── FrameBreak → switch to RIGHT column for Key Takeaways ────────────
    story.append(FrameBreak())

    takeaways = sections.get(_TAKEAWAYS_KEY, "").strip()
    right_block: list
    if takeaways:
        right_block = _render_takeaways(takeaways, styles)
    else:
        right_block = [
            Paragraph("Key Takeaways", styles["takeaways_label"]),
            Paragraph(
                "Takeaways unavailable for this brief.",
                styles["takeaway_item"],
            ),
        ]
    story.append(KeepInFrame(
        maxWidth=right_w - 10,  # account for frame leftPadding
        maxHeight=body_h,
        content=right_block,
        mode="shrink",
    ))

    # ── Switch to inner template + page break ────────────────────────────
    story.append(NextPageTemplate("inner"))
    story.append(PageBreak())

    # Remaining sections — single column, page 2+
    for title in _INNER_SECTIONS:
        content = sections.get(title, "").strip()
        if not content:
            continue
        story.extend(_render_section_with_label(title, content, styles))

    doc.build(story)
    return buf.getvalue()
