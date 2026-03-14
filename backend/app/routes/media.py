"""
Media routes — audio generation, video generation, streaming/download.
"""

import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user, get_current_user_from_token_param
from app.config import get_settings
from app.models.user import User
from app.schemas.media import AudioGenerationRequest, VideoGenerationRequest, MediaResponse
from app.services.media_service import generate_audio, generate_video_for_paper, get_media, get_supported_languages

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/{paper_id}/generate-audio", response_model=MediaResponse)
async def gen_audio(
    paper_id: str,
    request: AudioGenerationRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    sarvam_key = get_settings().SARVAM_API_KEY
    if not sarvam_key:
        raise HTTPException(400, "Sarvam API key required for TTS")

    media = generate_audio(
        paper_uid=paper_id,
        user=user,
        session=session,
        sarvam_api_key=sarvam_key,
        language=request.language,
        voice=request.voice,
    )
    return MediaResponse(
        paper_id=paper_id,
        language=media.language,
        audio_files=[os.path.basename(f) for f in (media.audio_files or [])],
        video_path=os.path.basename(media.video_path) if media.video_path else None,
        status=media.status,
    )


@router.post("/{paper_id}/generate-video", response_model=MediaResponse)
async def gen_video(
    paper_id: str,
    request: VideoGenerationRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    media = generate_video_for_paper(
        paper_uid=paper_id,
        user=user,
        session=session,
        language=request.language,
    )
    return MediaResponse(
        paper_id=paper_id,
        language=media.language,
        audio_files=[os.path.basename(f) for f in (media.audio_files or [])],
        video_path=os.path.basename(media.video_path) if media.video_path else None,
        status=media.status,
    )


@router.get("/{paper_id}/audio/{filename}")
async def stream_audio(
    paper_id: str,
    filename: str,
    request: Request,
    user: User = Depends(get_current_user_from_token_param),
    session: Session = Depends(get_session),
):
    media = get_media(paper_id, user, session)
    if not media or not media.audio_dir:
        raise HTTPException(404, "Audio not found")

    safe_name = os.path.basename(filename)
    if safe_name != filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    audio_path = os.path.join(media.audio_dir, safe_name)
    if not os.path.isfile(audio_path):
        raise HTTPException(404, "Audio file not found")

    return _stream_file(audio_path, "audio/wav", request)


@router.get("/{paper_id}/video")
async def stream_video(
    paper_id: str,
    request: Request,
    user: User = Depends(get_current_user_from_token_param),
    session: Session = Depends(get_session),
):
    media = get_media(paper_id, user, session)
    if not media or not media.video_path or not os.path.isfile(media.video_path):
        raise HTTPException(404, "Video not found")

    return _stream_file(media.video_path, "video/mp4", request)


@router.get("/{paper_id}/download-video")
async def download_video(
    paper_id: str,
    user: User = Depends(get_current_user_from_token_param),
    session: Session = Depends(get_session),
):
    media = get_media(paper_id, user, session)
    if not media or not media.video_path or not os.path.isfile(media.video_path):
        raise HTTPException(404, "Video not found")
    return FileResponse(
        media.video_path,
        media_type="video/mp4",
        filename=f"presentation_{paper_id}.mp4",
    )


@router.get("/languages")
async def languages():
    return get_supported_languages()


@router.get("/voices")
async def voices():
    from app.utils.tts import V3_VOICES_MALE, V3_VOICES_FEMALE
    return {"male": V3_VOICES_MALE, "female": V3_VOICES_FEMALE}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stream_file(path: str, media_type: str, request: Request):
    """Range-aware streaming for audio/video."""
    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not match:
            raise HTTPException(416, "Invalid Range header")
        start = int(match.group(1))
        end_str = match.group(2)
        end = int(end_str) if end_str else file_size - 1
        end = min(end, file_size - 1)
        if start >= file_size or start > end:
            raise HTTPException(416, "Range Not Satisfiable")
        length = end - start + 1

        def iterfile():
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            },
        )
    else:
        return StreamingResponse(
            open(path, "rb"),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )
@router.get("/{paper_id}", response_model=MediaResponse)
async def get_media_status(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    media = get_media(paper_id, user, session)
    if not media:
        raise HTTPException(404, "Media not found")
        
    return MediaResponse(
        paper_id=paper_id,
        language=media.language,
        audio_files=[os.path.basename(f) for f in (media.audio_files or [])],
        video_path=os.path.basename(media.video_path) if media.video_path else None,
        status=media.status,
    )
