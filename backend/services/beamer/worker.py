import json
import logging
import os
import re
import signal
import sys
import tempfile
import time
from pathlib import Path

import httpx
import redis as redis_lib
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env.shared")

from saral_shared import storage_client as storage  # noqa: E402
from saral_shared import webhook_client as wh  # noqa: E402
from saral_shared.text_cleaner import load_and_clean  # noqa: E402

from latex_template import build_beamer_document, compile_latex, convert_pdf_to_images  # noqa: E402
from ppt_generator import convert_pdf_to_images as ppt_convert_pdf_to_images  # noqa: E402
from ppt_generator import convert_pptx_to_pdf, process_presentation, script_to_paper_info  # noqa: E402
from bhashini import get_registry  # noqa: E402
from sarvam_translate import get_translator as get_sarvam_translator  # noqa: E402
from generator import generate_business_brief_with_gemini  # noqa: E402
from generator_v2 import generate_business_brief_v2  # noqa: E402
from pdf_renderer import render_business_brief_pdf  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("latex-worker")

STREAM = "saral:jobs:latex"
BRIEF_STREAM = "saral:jobs:business_brief"
GROUP = "saral-workers"
CONSUMER = f"latex-worker-{os.environ.get('HOSTNAME', str(os.getpid()))}"
DEFAULT_PPT_TEMPLATE = "template-saral"

GATEWAY_URL = os.environ.get("GATEWAY_WEBHOOK_URL", "http://localhost:8080")

# Translation provider: "sarvam" (default) uses Sarvam mayura/sarvam-translate;
# "bhashini" falls back to the IIIT Bhashini models.
TRANSLATION_PROVIDER = os.environ.get("TRANSLATION_PROVIDER", "sarvam").lower()

# Toggle between v1 (flash, no grounding) and v2 (pro + google_search + thinking).
# Default: v2. Set BUSINESS_BRIEF_V2=false to fall back to v1.
USE_V2 = os.environ.get("BUSINESS_BRIEF_V2", "true").lower() not in ("false", "0", "no")


def _truthy(val) -> bool:
    if val is None:
        return False
    return str(val).strip().lower() in ("1", "true", "yes", "on")


# Module-level state for SIGTERM handler
_rdb = None
_current_msg_id = None


def _sigterm_handler(sig, frame):
    log.info("[SIGTERM] shutting down, cleaning up consumer %s", CONSUMER)
    try:
        if _current_msg_id and _rdb:
            _rdb.xack(STREAM, GROUP, _current_msg_id)
        if _rdb:
            _rdb.xgroup_delconsumer(STREAM, GROUP, CONSUMER)
    except Exception as exc:
        log.warning("[SIGTERM] cleanup error: %s", exc)
    sys.exit(0)


signal.signal(signal.SIGTERM, _sigterm_handler)


def _download_images(image_assignments: dict, workdir: Path) -> dict[str, str]:
    """Download GCS images specified in image_assignments.

    image_assignments: { section_id -> gcs_path }
    Returns: { section_id -> local_relative_path }
    """
    if not image_assignments:
        return {}

    asset_dir = workdir / "assets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    local_map: dict[str, str] = {}

    for section_id, gcs_path in image_assignments.items():
        suffix = Path(gcs_path).suffix or ".png"
        safe_id = re.sub(r"[^\w-]", "_", section_id)
        local_path = asset_dir / f"{safe_id}{suffix}"
        try:
            storage.download_to_file(gcs_path, str(local_path))
            local_map[section_id] = str(local_path.relative_to(workdir))
        except Exception as exc:
            log.warning("failed to download image for section %s: %s", section_id, exc)
    return local_map


_LANG_TO_BCP47: dict[str, str] = {
    "english": "en-IN",
    "hindi": "hi-IN",
    "bengali": "bn-IN",
    "gujarati": "gu-IN",
    "kannada": "kn-IN",
    "malayalam": "ml-IN",
    "marathi": "mr-IN",
    "odia": "od-IN",
    "punjabi": "pa-IN",
    "tamil": "ta-IN",
    "telugu": "te-IN",
    "assamese": "as-IN",
    "bodo": "brx-IN",
    "dogri": "doi-IN",
    "konkani": "kok-IN",
    "maithili": "mai-IN",
    "nepali": "ne-IN",
    "manipuri": "mni-IN",
    "sanskrit": "sa-IN",
    "santali": "sat-IN",
    "urdu": "ur-IN",
}


def _normalize_language(value: str | None) -> str:
    """Coerce a frontend-friendly language name (e.g. "hindi") or an
    already-BCP-47 code (e.g. "hi-IN") to the canonical BCP-47 form that
    Sarvam/Bhashini expect. Unknown/empty values fall back to en-IN so the
    worker degrades to English instead of crashing.
    """
    if not value:
        return "en-IN"
    v = value.strip()
    if not v:
        return "en-IN"
    # Already BCP-47? Accept as-is (case-normalised).
    if "-" in v and len(v) >= 4:
        # Common case: "hi-IN" / "HI-in" — keep the script's casing convention.
        parts = v.split("-", 1)
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return _LANG_TO_BCP47.get(v.lower(), "en-IN")


def _translate_script_for_slides(script: dict) -> dict:
    """Return a copy of *script* with section titles and bullets translated
    into script["language"] when that language is non-English.

    Falls back gracefully: if the translation provider is unavailable or a
    translation fails, the original English text is kept so the slide still renders.
    """
    raw_lang = script.get("slide_language") or script.get("language") or "en-IN"
    lang = _normalize_language(raw_lang)
    if raw_lang != lang:
        log.info(
            "run_id=%s: normalized slide language %r → %r",
            script.get("run_id", "?"), raw_lang, lang,
        )
    if lang == "en-IN":
        return script

    import copy

    # Manipuri: always route through Bhashini (Manipuri_Bengali model).
    # Sarvam returns Meetei-script Manipuri which xelatex can't render.
    if lang == "mni-IN":
        registry = get_registry()
        if registry is None:
            log.warning("run_id=%s: Bhashini unavailable for Manipuri, slides stay in English", script.get("run_id", "?"))
            return script
        translated = copy.deepcopy(script)
        for section in translated.get("sections", []):
            raw_title = section.get("title") or ""
            if raw_title:
                section["title"] = registry.translate(raw_title, lang)
            raw_bullets = section.get("bullets") or []
            if raw_bullets:
                section["bullets"] = registry.translate_list(raw_bullets, lang)
        translated["language"] = lang
        translated["slide_language"] = lang
        return translated

    if TRANSLATION_PROVIDER != "bhashini":
        # Use Sarvam translate (mayura:v1 / sarvam-translate:v1).
        translator = get_sarvam_translator()
        if translator is None:
            log.warning("run_id=%s: Sarvam translator unavailable, slides will stay in English", script.get("run_id", "?"))
            return script

        translated = copy.deepcopy(script)
        for section in translated.get("sections", []):
            raw_title = section.get("title") or ""
            if raw_title:
                section["title"] = translator.translate(raw_title, lang)

            raw_bullets = section.get("bullets") or []
            if raw_bullets:
                section["bullets"] = translator.translate_list(raw_bullets, lang)
    else:
        registry = get_registry()
        if registry is None:
            log.warning("run_id=%s: Bhashini unavailable, slides will stay in English", script.get("run_id", "?"))
            return script

        translated = copy.deepcopy(script)
        for section in translated.get("sections", []):
            raw_title = section.get("title") or ""
            if raw_title:
                section["title"] = registry.translate(raw_title, lang)

            raw_bullets = section.get("bullets") or []
            if raw_bullets:
                section["bullets"] = registry.translate_list(raw_bullets, lang)

    log.info(
        "run_id=%s: translated %d section titles + bullets → %s (provider=%s)",
        script.get("run_id", "?"),
        len(translated.get("sections", [])),
        lang,
        TRANSLATION_PROVIDER,
    )
    # Log first section title before/after so we can confirm actual translation happened
    orig_sections = script.get("sections", [])
    new_sections = translated.get("sections", [])
    if orig_sections and new_sections:
        orig_title = orig_sections[0].get("title", "")
        new_title = new_sections[0].get("title", "")
        if orig_title == new_title:
            log.warning(
                "run_id=%s: first section title UNCHANGED after translation (%r) — "
                "check %s connectivity",
                script.get("run_id", "?"), orig_title, TRANSLATION_PROVIDER,
            )
        else:
            log.info(
                "run_id=%s: first section title translated: %r → %r",
                script.get("run_id", "?"), orig_title, new_title,
            )
    # Store the normalised BCP-47 code so that build_beamer_document picks
    # the correct Indic font even when the frontend sent a human-readable
    # language name (e.g. "Sanskrit" → "sa-IN").
    translated["language"] = lang
    translated["slide_language"] = lang
    return translated


def _send_brief_webhook(brief_id: str, payload: dict, max_retries: int = 3, delay: float = 2.0) -> None:
    """POST business-brief result to the generic webhook route.
    Uses step_name='business_brief' and brief_id so the gateway routes it
    to the business_brief handler inside webhook.Handler.
    """
    url = f"{GATEWAY_URL}/webhooks/worker/business_brief"
    for attempt in range(1, max_retries + 1):
        try:
            r = httpx.post(url, json=payload, timeout=10.0)
            r.raise_for_status()
            log.info("brief webhook ok brief_id=%s status=%d", brief_id, r.status_code)
            return
        except (httpx.HTTPError, httpx.RequestError) as exc:
            log.warning("brief webhook attempt %d/%d failed: %s", attempt, max_retries, exc)
            if attempt < max_retries:
                time.sleep(delay)
    raise RuntimeError(f"business-brief webhook failed after {max_retries} attempts")


def _brief_gcs_key(user_id: str, paper_id: str, suffix: str) -> str:
    """Storage key layout for business brief artifacts."""
    return f"{user_id}/{paper_id}/business_brief/{suffix}"


def process_brief_job(rdb, msg_id: str, data: dict) -> None:
    """Handle a saral:jobs:business_brief message.
    Two modes:
      mode='full'     — fetch extracted text from GCS, call Gemini, render PDF,
                        upload both, webhook with sections + paths.
      mode='pdf_only' — re-render the PDF from sections in the payload,
                        upload, webhook with pdf path only.
    """
    brief_id = data["brief_id"]
    mode = data.get("mode", "full")

    try:
        if mode == "pdf_only":
            result = _process_brief_pdf_only(data)
        else:
            result = _process_brief_full(data)
        result["step_name"] = "business_brief"
        result["brief_id"] = brief_id
        _send_brief_webhook(brief_id, result)
    except Exception as exc:
        log.exception("brief job failed brief_id=%s mode=%s", brief_id, mode)
        _send_brief_webhook(
            brief_id,
            {
                "step_name": "business_brief",
                "brief_id": brief_id,
                "status": "failed",
                "error_message": f"{type(exc).__name__}: {exc}",
            },
        )
    finally:
        rdb.xack(BRIEF_STREAM, GROUP, msg_id)


def _process_brief_full(data: dict) -> dict:
    """Run the full Gemini → PDF pipeline for a fresh brief."""
    brief_id = data["brief_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    text_path = data["text_path"]
    gemini_key = data.get("gemini_key") or os.environ.get("GEMINI_API_KEY", "")

    if not gemini_key:
        raise ValueError("no Gemini API key (neither user key nor GEMINI_API_KEY env)")

    log.info("brief full brief_id=%s paper_id=%s v2=%s", brief_id, paper_id, USE_V2)

    # 1. Download and clean the extracted text.
    text_bytes = storage.download_bytes(text_path)
    clean = load_and_clean(text_bytes)
    if not clean.strip():
        raise ValueError("extracted text is empty after cleaning")

    # 2. Select generator version.
    # Per-job model_version ("v1"/"v2") beats the process-wide USE_V2 default.
    job_version = data.get("model_version", "")
    if job_version == "v2":
        use_v2 = True
    elif job_version == "v1":
        use_v2 = False
    else:
        use_v2 = USE_V2

    # 3. Generate — grounded (v2) or legacy flash (v1).
    if use_v2:
        sections = generate_business_brief_v2(gemini_key, clean)
        model_version = "v2"
    else:
        sections = generate_business_brief_with_gemini(gemini_key, clean)
        model_version = "v1"

    # 3. Upload raw JSON for audit.
    audit_payload = {"sections": sections, "model_version": model_version}
    json_key = _brief_gcs_key(user_id, paper_id, "brief.json")
    json_path = storage.upload_json(audit_payload, json_key)

    # 4. Render + upload PDF.
    pdf_bytes = render_business_brief_pdf(sections, paper_title=data.get("paper_title") or "Research Paper")
    pdf_key = _brief_gcs_key(user_id, paper_id, "brief.pdf")
    pdf_path = storage.upload_bytes(pdf_bytes, pdf_key, content_type="application/pdf")

    return {
        "status": "completed",
        "sections": sections,
        "model_version": model_version,
        "json_gcs_path": json_path,
        "pdf_gcs_path": pdf_path,
    }


def _process_brief_pdf_only(data: dict) -> dict:
    """Re-render the PDF from sections shipped in the payload (after a user edit)."""
    brief_id = data["brief_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    sections_json = data.get("sections_json", "")
    if not sections_json:
        raise ValueError("pdf_only job missing sections_json")

    sections = json.loads(sections_json)
    log.info("brief pdf_only brief_id=%s paper_id=%s sections=%d", brief_id, paper_id, len(sections))

    pdf_bytes = render_business_brief_pdf(sections, paper_title=data.get("paper_title") or "Research Paper")
    pdf_key = _brief_gcs_key(user_id, paper_id, "brief.pdf")
    pdf_path = storage.upload_bytes(pdf_bytes, pdf_key, content_type="application/pdf")

    # Sections intentionally omitted from the return value here — the gateway
    # already has them in the DB when it reaches this re-render step.
    return {"status": "completed", "pdf_gcs_path": pdf_path}


def process_job(rdb, msg_id: str, data: dict):
    run_id = data["run_id"]
    step_id = data["step_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    script_gcs_path = data["script_gcs_path"]
    extracted_gcs_path = data.get("extracted_gcs_path", "")
    output_format = data.get("output_format", "beamer_pdf")
    # Empty string from Redis must not override the default (otherwise assets/.pptx).
    ppt_template = (data.get("ppt_template") or DEFAULT_PPT_TEMPLATE).strip()
    if ppt_template == "sampleppt":
        log.warning(
            "run_id=%s: ppt_template=sampleppt requested; remapping to %s",
            run_id,
            DEFAULT_PPT_TEMPLATE,
        )
        ppt_template = DEFAULT_PPT_TEMPLATE

    try:
        script = storage.download_json(script_gcs_path)
        extracted = storage.download_json(extracted_gcs_path) if extracted_gcs_path else {}

        if output_format == "ppt":
            _process_ppt_job(rdb, msg_id, data, run_id, step_id, paper_id, user_id, script, ppt_template)
        else:
            _process_beamer_job(rdb, msg_id, data, run_id, step_id, paper_id, user_id, script, extracted, ppt_template)

    except Exception as exc:
        log.exception("run_id=%s: beamer job failed (format=%s)", run_id, output_format)
        try:
            wh.send_webhook(
                {
                    "run_id": run_id,
                    "step_id": step_id,
                    "step_name": "beamer_compile",
                    "status": "failed",
                    "gcs_output_path": "",
                    "error_message": str(exc),
                    "next_step": "",
                    "next_job_data": {},
                }
            )
        except Exception:
            pass


def _process_beamer_job(rdb, msg_id, data, run_id, step_id, paper_id, user_id, script, extracted, ppt_template=""):
    """Original LaTeX/beamer PDF path."""
    with tempfile.TemporaryDirectory() as tmpdir:
        workdir = Path(tmpdir)
        tex_path = workdir / "main.tex"
        pdf_dir = workdir / "build"

        # Translate bullets + section titles to the target language (no-op for en-IN)
        slide_script = _translate_script_for_slides(script)

        image_assignments = script.get("image_assignments") or {}
        local_image_map = _download_images(image_assignments, workdir)
        tex_source = build_beamer_document(slide_script, local_image_map, theme=ppt_template)
        tex_path.write_text(tex_source, encoding="utf-8")

        pdf_path = compile_latex(str(tex_path), str(pdf_dir))
        frame_paths = convert_pdf_to_images(pdf_path, str(pdf_dir))
        if not frame_paths:
            raise RuntimeError("no slide frames were generated from the compiled PDF")

        # Versioned upload (see _process_ppt_job for rationale).
        import time as _time
        compile_version = int(_time.time() * 1000)
        version_prefix = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/v{compile_version}"
        pdf_version_key = f"{version_prefix}/slides.pdf"
        pdf_version_path = storage.upload_file(pdf_path, pdf_version_key, content_type="application/pdf")

        pdf_key = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/slides.pdf"
        pdf_gcs_path = storage.upload_file(pdf_path, pdf_key, content_type="application/pdf")

        frame_prefix = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/frames/"
        for frame_path in frame_paths:
            frame_name = Path(frame_path).name
            storage.upload_file(frame_path, frame_prefix + frame_name, content_type="image/png")

    wh.send_webhook(
        {
            "run_id": run_id,
            "step_id": step_id,
            "step_name": "beamer_compile",
            "status": "completed",
            "gcs_output_path": pdf_gcs_path,
            "compile_version": compile_version,
            "error_message": "",
            "next_step": "",
            "next_job_data": {},
        }
    )
    rdb.xack(STREAM, GROUP, msg_id)
    log.info("run_id=%s: beamer compile complete v=%s versioned=%s", run_id, compile_version, pdf_version_path)


def _process_ppt_job(rdb, msg_id, data, run_id, step_id, paper_id, user_id, script, ppt_template):
    """PPT template-fill path: script → PPTX → LibreOffice PDF → frames (+ optional PDF upload)."""
    template_gcs_path = (data.get("template_gcs_path") or "").strip()
    slide_export_pdf_primary = _truthy(data.get("slide_export_pdf_primary"))

    assets_dir = Path(__file__).parent / "assets"
    downloaded_tpl = None
    try:
        if template_gcs_path:
            fd, downloaded_tpl = tempfile.mkstemp(suffix=".pptx")
            os.close(fd)
            storage.download_to_file(template_gcs_path, downloaded_tpl)
            template_path = downloaded_tpl
            log.info("run_id=%s: using user-uploaded PPTX template", run_id)
        else:
            template_path = str(assets_dir / f"{ppt_template}.pptx")
            if not Path(template_path).exists():
                log.warning("PPT template %s not found, falling back to %s.pptx", template_path, DEFAULT_PPT_TEMPLATE)
                template_path = str(assets_dir / f"{DEFAULT_PPT_TEMPLATE}.pptx")

        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            pptx_out = workdir / "slides.pptx"
            pdf_dir = workdir / "pdf"
            frames_dir = workdir / "frames"

            # Translate bullets + section titles to the target language before
            # filling the PPTX template. Without this, language changes on the
            # frontend silently no-op for PPT output — the patched script.json
            # carries the new language tag but the template fill below would
            # use the original English text. The beamer/PDF path at
            # _process_beamer_job() already does this; the two paths must stay
            # symmetric.
            translated_script = _translate_script_for_slides(script)
            paper_info, scripts_info = script_to_paper_info(translated_script)
            image_assignments = translated_script.get("image_assignments") or {}
            local_rel = _download_images(image_assignments, workdir)
            local_abs = {k: str(workdir / v) for k, v in local_rel.items()}
            ok = process_presentation(
                paper_info, scripts_info, template_path, str(pptx_out), local_images=local_abs or None
            )
            if not ok:
                raise RuntimeError("process_presentation returned False — PPTX generation failed")

            pdf_path = convert_pptx_to_pdf(str(pptx_out), str(pdf_dir))
            frame_paths = ppt_convert_pdf_to_images(pdf_path, str(frames_dir))
            if not frame_paths:
                raise RuntimeError("no slide frames were generated from the PPTX-derived PDF")

            # ── Versioned upload ──────────────────────────────────────────────
            # Each compile writes to a unique v{epoch_ms}/ subfolder so prior
            # outputs survive when the user edits and regenerates. The
            # canonical slides.{pdf,pptx} at the run root is still kept (a
            # "pointer to latest") so existing callers that don't know about
            # versions stay working. compile_version flows out via the
            # webhook so the gateway can include it in the SSE event, which
            # is how the frontend binds the new card to its specific output.
            import time as _time
            compile_version = int(_time.time() * 1000)
            version_prefix = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/v{compile_version}"

            pdf_version_key = f"{version_prefix}/slides.pdf"
            pdf_version_path = storage.upload_file(pdf_path, pdf_version_key, content_type="application/pdf")

            pptx_version_key = f"{version_prefix}/slides.pptx"
            pptx_version_path = storage.upload_file(
                str(pptx_out),
                pptx_version_key,
                content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )

            # Latest-pointer copies (overwrite each compile)
            pdf_key = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/slides.pdf"
            pdf_gcs_path = storage.upload_file(pdf_path, pdf_key, content_type="application/pdf")

            pptx_key = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/slides.pptx"
            pptx_gcs_path = storage.upload_file(
                str(pptx_out),
                pptx_key,
                content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )

            frame_prefix = f"{user_id}/{paper_id}/runs/{run_id}/beamer_compile/frames/"
            for frame_path in frame_paths:
                frame_name = Path(frame_path).name
                storage.upload_file(frame_path, frame_prefix + frame_name, content_type="image/png")

        primary = pdf_gcs_path if slide_export_pdf_primary else pptx_gcs_path
        wh.send_webhook(
            {
                "run_id": run_id,
                "step_id": step_id,
                "step_name": "beamer_compile",
                "status": "completed",
                "gcs_output_path": primary,
                "compile_version": compile_version,
                "error_message": "",
                "next_step": "",
                "next_job_data": {},
            }
        )
        rdb.xack(STREAM, GROUP, msg_id)
        log.info(
            "run_id=%s: PPT compile complete v=%s pptx=%s pdf=%s primary=%s",
            run_id, compile_version, pptx_version_path, pdf_version_path, primary,
        )
    finally:
        if downloaded_tpl:
            Path(downloaded_tpl).unlink(missing_ok=True)


def main():
    global _rdb
    _rdb = redis_lib.from_url(os.environ["REDIS_URL"], decode_responses=True)

    for stream in (STREAM, BRIEF_STREAM):
        try:
            _rdb.xgroup_create(stream, GROUP, id="$", mkstream=True)
        except redis_lib.exceptions.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    log.info("Beamer worker started, consumer=%s", CONSUMER)

    # ── Startup XAUTOCLAIM sweep: reclaim jobs from any previous crashed instance
    log.info("[startup] XAUTOCLAIM sweep for orphaned messages")
    for stream, handler in ((STREAM, process_job), (BRIEF_STREAM, process_brief_job)):
        try:
            next_id = "0-0"
            while True:
                next_id, claimed, _ = _rdb.xautoclaim(
                    stream, GROUP, CONSUMER,
                    min_idle_time=300000,  # 5 minutes in ms
                    start_id=next_id,
                    count=10,
                )
                if not claimed:
                    break
                log.info("[startup] reclaimed %d orphaned messages from %s", len(claimed), stream)
                for msg_id, data in claimed:
                    global _current_msg_id
                    _current_msg_id = msg_id
                    handler(_rdb, msg_id, data)
                    _current_msg_id = None
                if next_id == "0-0":
                    break
        except Exception as exc:
            log.warning("[startup] XAUTOCLAIM sweep error on %s: %s", stream, exc)

    while True:
        try:
            messages = _rdb.xreadgroup(GROUP, CONSUMER, {STREAM: ">", BRIEF_STREAM: ">"}, count=1, block=5000)
            if not messages:
                continue
            for stream_name, stream_messages in messages:
                for msg_id, data in stream_messages:
                    _current_msg_id = msg_id
                    if stream_name == BRIEF_STREAM:
                        process_brief_job(_rdb, msg_id, data)
                    else:
                        process_job(_rdb, msg_id, data)
                    _current_msg_id = None
        except redis_lib.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s")
            time.sleep(5)
        except Exception:
            log.exception("Beamer worker loop error")
            time.sleep(2)


if __name__ == "__main__":
    main()
