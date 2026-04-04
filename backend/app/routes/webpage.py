import os
import random
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from app.auth.dependencies import get_current_user
from app.models.request_models import WebpageGenerateRequest, WebpageGenerateResponse, WebpageVariant
from app.routes.api_keys import get_api_keys
from app.services.storage_manager import storage_manager
from app.services.webpage_generator import STYLE_PROFILES, clear_variants, generate_variant, list_variants, save_variant_meta

router = APIRouter()


def _resolve_existing_path(raw_path: str | None) -> Path | None:
    if not raw_path:
        return None

    p = Path(raw_path)
    backend_dir = Path(__file__).resolve().parents[2]
    repo_dir = Path(__file__).resolve().parents[3]

    candidates = [p, backend_dir / p, repo_dir / p]
    if raw_path.startswith("backend/"):
        tail = Path(raw_path[len("backend/"):])
        candidates.append(backend_dir / tail)

    for cand in candidates:
        if cand.exists():
            return cand
    return None


@router.post("/{paper_id}/generate", response_model=WebpageGenerateResponse)
async def generate_webpage(
    paper_id: str,
    request: WebpageGenerateRequest,
    current_user: dict = Depends(get_current_user),
    api_keys: dict = Depends(get_api_keys),
):
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info:
        raise HTTPException(status_code=404, detail="Paper not found")

    gemini_key = api_keys.get("gemini_key") or os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    variants = []
    count = 1
    clear_variants(paper_id)

    unique_profiles = random.sample(STYLE_PROFILES, k=count)
    used_theme_names = set()
    for idx in range(count):
        last_error = None
        variant_id = None
        meta = None

        # Retry a few times because model outputs can occasionally violate constraints.
        for attempt in range(4):
            preferred = unique_profiles[idx]
            if preferred["name"] in used_theme_names:
                pool = [p for p in STYLE_PROFILES if p["name"] not in used_theme_names]
                preferred = random.choice(pool) if pool else random.choice(STYLE_PROFILES)

            try:
                variant_id, meta = generate_variant(
                    paper_id=paper_id,
                    user_id=current_user.get("id", "local-user"),
                    paper_info=paper_info,
                    api_key=gemini_key,
                    variant_index=idx,
                    profile_override=preferred,
                )
                used_theme_names.add(meta["theme"])
                break
            except Exception as exc:
                last_error = exc
                continue

        if not variant_id or not meta:
            raise HTTPException(status_code=502, detail=f"Unable to generate high-quality webpage variant: {last_error}")

        save_variant_meta(paper_id, meta)
        variants.append(
            WebpageVariant(
                variant_id=variant_id,
                theme=meta["theme"],
                preview_url=f"/api/webpage/{paper_id}/preview/{variant_id}",
                download_url=f"/api/webpage/{paper_id}/download/{variant_id}",
                created_at=meta["created_at"],
            )
        )

    return WebpageGenerateResponse(paper_id=paper_id, variants=variants)


@router.get("/{paper_id}/variants", response_model=list[WebpageVariant])
async def get_variants(paper_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    metas = list_variants(paper_id)
    out = []
    for meta in metas:
        variant_id = meta.get("variant_id")
        if not variant_id:
            continue
        out.append(
            WebpageVariant(
                variant_id=variant_id,
                theme=meta.get("theme", "Custom"),
                preview_url=f"/api/webpage/{paper_id}/preview/{variant_id}",
                download_url=f"/api/webpage/{paper_id}/download/{variant_id}",
                created_at=meta.get("created_at", ""),
            )
        )
    return out


@router.get("/{paper_id}/preview/{variant_id}")
async def preview_variant(paper_id: str, variant_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    path = Path(f"temp/webpages/{paper_id}/{variant_id}.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Variant not found")
    return HTMLResponse(path.read_text(encoding="utf-8"))


@router.get("/{paper_id}/download/{variant_id}")
async def download_variant(paper_id: str, variant_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    path = Path(f"temp/webpages/{paper_id}/{variant_id}.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Variant not found")
    return FileResponse(path, media_type="text/html", filename=f"webpage_{variant_id}.html")


@router.get("/{paper_id}/asset/{image_name}")
async def get_variant_asset(paper_id: str, image_name: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    paper_info = storage_manager.get_paper(paper_id)
    if not paper_info:
        raise HTTPException(status_code=404, detail="Paper not found")

    for raw_path in paper_info.get("image_files", []):
        resolved = _resolve_existing_path(raw_path)
        if resolved and resolved.name == image_name:
            return FileResponse(resolved)

    raise HTTPException(status_code=404, detail="Asset not found")
