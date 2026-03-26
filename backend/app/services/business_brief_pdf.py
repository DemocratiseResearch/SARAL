import os
import logging
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    HRFlowable,
    ListFlowable,
    ListItem,
)
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
from app.utils.timing import track_performance

logger = logging.getLogger(__name__)

# ── Colour palette ────────────────────────────────────────────────
BLACK = HexColor("#000000")
DARK_GREY = HexColor("#333333")
RULE_GREY = HexColor("#CCCCCC")


def _build_styles():
    """Return a dict of ParagraphStyles that match the reference images."""
    base = getSampleStyleSheet()

    styles = {
        "heading": ParagraphStyle(
            "BriefHeading",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=BLACK,
            spaceAfter=6,
            spaceBefore=4,
        ),
        "body": ParagraphStyle(
            "BriefBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=DARK_GREY,
            alignment=TA_JUSTIFY,
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "BriefBullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=DARK_GREY,
            alignment=TA_LEFT,
            leftIndent=18,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "BriefTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=BLACK,
            spaceAfter=12,
        ),
    }
    return styles


def _parse_section_content(content: str, styles: dict) -> list:
    """Convert a section's text into flowable elements.

    Logic:
    - Lines starting with • or - are rendered as bullet items.
    - Consecutive bullet lines are grouped into a single ListFlowable.
    - Everything else is rendered as a body paragraph.
    - **bold text** patterns are converted to <b> tags for reportlab.
    """
    flowables = []
    bullet_buffer = []

    def _flush_bullets():
        if not bullet_buffer:
            return
        items = []
        for b in bullet_buffer:
            b_formatted = _bold_markup(b)
            items.append(
                ListItem(Paragraph(b_formatted, styles["bullet"]), bulletColor=BLACK)
            )
        flowables.append(
            ListFlowable(
                items,
                bulletType="bullet",
                bulletFontSize=8,
                bulletOffsetY=-1,
                leftIndent=18,
                spaceBefore=4,
                spaceAfter=4,
            )
        )
        bullet_buffer.clear()

    for line in content.split("\n"):
        stripped = line.strip()
        if not stripped:
            _flush_bullets()
            continue

        if stripped.startswith("•") or stripped.startswith("-"):
            text = stripped.lstrip("•-").strip()
            if text:
                bullet_buffer.append(text)
        else:
            _flush_bullets()
            flowables.append(Paragraph(_bold_markup(stripped), styles["body"]))

    _flush_bullets()
    return flowables


def _bold_markup(text: str) -> str:
    """Convert **text** to <b>text</b> for reportlab Paragraph."""
    import re
    # Replace **bold** with <b>bold</b>
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Escape any leftover & < > for XML safety
    # (but preserve our <b> tags)
    text = text.replace("&", "&amp;")
    # Be careful not to break our <b> tags
    text = re.sub(r"<(?!/?b>)", "&lt;", text)
    text = text.replace(">", "&gt;")
    # Restore our b tags
    text = text.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
    return text


@track_performance
def generate_business_brief_pdf(paper_id: str, sections: dict, paper_title: str = "Research Paper") -> str:
    """Generate a professionally formatted Business Brief PDF.

    Args:
        paper_id: Unique paper identifier.
        sections: Dict mapping section name → content string.
        paper_title: Title of the source paper (used in the PDF header).

    Returns:
        Absolute path to the generated PDF file.
    """
    output_dir = os.path.join("temp", "business_briefs")
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, f"{paper_id}_business_brief.pdf")

    styles = _build_styles()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=1 * inch,
        rightMargin=1 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
    )

    story = []

    # ── Title ─────────────────────────────────────────────────
    story.append(Paragraph("Business Brief", styles["title"]))
    story.append(
        Paragraph(
            f"<i>Source: {_bold_markup(paper_title)}</i>",
            styles["body"],
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        HRFlowable(
            width="100%", thickness=1.5, color=RULE_GREY, spaceAfter=10, spaceBefore=4
        )
    )

    # ── Sections ──────────────────────────────────────────────
    section_order = [
        "Executive Summary",
        "Business Problem Addressed",
        "Technical Innovation Summary",
        "Business Impact",
        "Commercial Applications",
        "Implementation Considerations",
        "Risks and Limitations",
        "Strategic Recommendations",
    ]

    for section_name in section_order:
        content = sections.get(section_name, "")
        if not content:
            continue

        # Section heading
        story.append(Paragraph(section_name, styles["heading"]))

        # Section body
        body_flowables = _parse_section_content(content, styles)
        story.extend(body_flowables)

        # Horizontal rule separator
        story.append(Spacer(1, 6))
        story.append(
            HRFlowable(
                width="100%",
                thickness=0.75,
                color=RULE_GREY,
                spaceAfter=10,
                spaceBefore=2,
            )
        )

    doc.build(story)
    logger.info(f"Business brief PDF generated at {pdf_path}")
    return os.path.abspath(pdf_path)
