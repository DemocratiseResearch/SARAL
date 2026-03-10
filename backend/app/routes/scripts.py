"""
Script routes — generate / list / update / assign images.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.scripts import ScriptResponse, SectionScript, ScriptUpdateRequest
from app.services.script_service import generate_scripts, get_scripts, update_script, assign_images
from app.services.api_key_service import get_key
from app.config import get_settings

router = APIRouter(prefix="/scripts", tags=["scripts"])


@router.post("/{paper_id}/generate", response_model=ScriptResponse)
async def generate(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = get_settings()
    model = settings.LLM_MODEL

    # Try user's stored key first, fall back to server-level env var
    api_key = get_key(user, session, "llm") or settings.LLM_API_KEY or None

    scripts = generate_scripts(paper_id, user, session, model, api_key)

    return ScriptResponse(
        paper_id=paper_id,
        sections=[
            SectionScript(
                id=s.id,
                section_name=s.section_name,
                content=s.content,
                bullet_points=s.bullet_points or [],
                assigned_image=s.assigned_image,
            )
            for s in scripts
        ],
    )


@router.get("/{paper_id}", response_model=ScriptResponse)
async def list_scripts(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    scripts = get_scripts(paper_id, user, session)
    if not scripts:
        raise HTTPException(404, "Scripts not found")
    return ScriptResponse(
        paper_id=paper_id,
        sections=[
            SectionScript(
                id=s.id,
                section_name=s.section_name,
                content=s.content,
                bullet_points=s.bullet_points or [],
                assigned_image=s.assigned_image,
            )
            for s in scripts
        ],
    )


@router.put("/{script_id}", response_model=SectionScript)
async def update(
    script_id: int,
    request: ScriptUpdateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    s = update_script(
        script_id, user, session,
        content=request.content,
        bullet_points=request.bullet_points,
        assigned_image=request.assigned_image,
    )
    return SectionScript(
        id=s.id,
        section_name=s.section_name,
        content=s.content,
        bullet_points=s.bullet_points or [],
        assigned_image=s.assigned_image,
    )


@router.post("/{paper_id}/assign-images")
async def assign(
    paper_id: str,
    assignments: dict[str, str],
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    assign_images(paper_id, assignments, user, session)
    return {"message": "Images assigned"}
