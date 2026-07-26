"""Frame-based (slide presentation) render mode: one segment per slide, encoded
in parallel then concatenated into clean and subtitle-burned finals."""

import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from saral_shared import storage_client as storage
from saral_shared import webhook_client as wh

from config import GROUP, STREAM
from ffmpeg_utils import _ffmpeg_has_subtitles_filter, _probe_duration, _run
from media_io import _concat_audio, _download_audio_segments, _download_frames
from subtitles import _split_narration_into_cues, _write_ass

log = logging.getLogger("ffmpeg-worker")

_MAX_ENCODE_WORKERS = min(max(2, (os.cpu_count() or 4) // 2), 4)
_FFMPEG_THREADS_PER_ENCODE = max(1, (os.cpu_count() or 4) // _MAX_ENCODE_WORKERS)

_SLIDE_FPS = 5


def _render_segment(
    frame_path: Path,
    audio_path: Path | None,
    duration: float,
    output_path: Path,
    narration: str | None = None,
):
    video_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"

    cwd: str | None = None
    if narration and narration.strip() and duration > 0 and _ffmpeg_has_subtitles_filter():
        ass_path = output_path.parent / f"{output_path.stem}.ass"
        cues = _split_narration_into_cues(narration, duration)
        if cues:
            _write_ass(cues, ass_path)
            video_filter = f"{video_filter},subtitles=filename={ass_path.name}"
            cwd = str(output_path.parent)
    fps_str = str(_SLIDE_FPS)
    threads_str = str(_FFMPEG_THREADS_PER_ENCODE)
    if audio_path is None:
        _run(
            [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-framerate",
                fps_str,
                "-i",
                str(frame_path),
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-t",
                f"{duration:.3f}",
                "-threads",
                threads_str,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "stillimage",
                "-r",
                fps_str,
                "-pix_fmt",
                "yuv420p",
                "-vf",
                video_filter,
                "-c:a",
                "aac",
                "-shortest",
                str(output_path),
            ],
            cwd=cwd,
        )
        return

    _run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-framerate",
            fps_str,
            "-i",
            str(frame_path),
            "-i",
            str(audio_path),
            "-threads",
            threads_str,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-tune",
            "stillimage",
            "-r",
            fps_str,
            "-pix_fmt",
            "yuv420p",
            "-vf",
            video_filter,
            "-c:a",
            "aac",
            "-shortest",
            str(output_path),
        ],
        cwd=cwd,
    )


def _render_one_slide(
    idx: int,
    frame_path: "Path",
    slide: dict,
    audio_dir: "Path",
    segments_dir: "Path",
    run_id: str,
    total: int,
) -> "tuple[int, Path, float, str]":
    """Download, concat, probe, and encode a single slide segment.

    Designed to run inside a ThreadPoolExecutor; all heavy work is done via
    FFmpeg subprocesses so the GIL is released for the duration of the encode.

    Returns (idx, segment_path, duration_seconds, narration_text) so callers
    can re-sort into the original order AND build a global subtitle file
    later (after concat) with cumulative time offsets.

    Subtitles are NO LONGER burned into the per-segment video. Two finals
    get built downstream: a clean no-subs video, and a second pass that
    burns subs over the concatenated whole. This lets the frontend toggle
    between the two without re-rendering.
    """
    local_audio_parts = _download_audio_segments(
        slide.get("audio_paths", []), audio_dir / f"slide_{idx:03d}"
    )
    merged_audio = _concat_audio(local_audio_parts, audio_dir / f"slide_{idx:03d}.wav")
    duration = _probe_duration(str(merged_audio)) if merged_audio else 2.5

    segment_path = segments_dir / f"segment_{idx:03d}.mp4"
    _render_segment(
        frame_path,
        merged_audio,
        duration,
        segment_path,
        narration=None,  # subs are burned post-concat, not per-segment
    )
    log.info("run_id=%s: rendered segment %d/%d (%.2fs)", run_id, idx + 1, total, duration)
    return idx, segment_path, duration, slide.get("text") or ""


def _process_frame_based_video(rdb, msg_id: str, run_id: str, step_id: str, paper_id: str, user_id: str, data: dict):
    """Generate frame-based presentation video (video mode)"""
    frames_prefix = data["frames_prefix"]
    audio_manifest_path = data["audio_manifest_gcs_path"]
    log.info("run_id=%s: frame-based mode, frames_prefix=%s audio_manifest=%s", run_id, frames_prefix, audio_manifest_path)

    try:
        manifest = storage.download_json(audio_manifest_path)
        log.info("run_id=%s: manifest downloaded, slides=%d", run_id, len(manifest.get("slides", [])))

        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            frames_dir = workdir / "frames"
            audio_dir = workdir / "audio"
            segments_dir = workdir / "segments"
            audio_dir.mkdir(parents=True, exist_ok=True)
            segments_dir.mkdir(parents=True, exist_ok=True)

            frame_paths = _download_frames(frames_prefix, frames_dir)
            log.info("run_id=%s: downloaded %d frames", run_id, len(frame_paths))
            if not frame_paths:
                raise RuntimeError("no frame images found for ffmpeg stitching")

            slides = {slide["frame_index"]: slide for slide in manifest.get("slides", [])}

            workers = min(len(frame_paths), _MAX_ENCODE_WORKERS)
            log.info("run_id=%s: encoding %d segments with %d parallel workers", run_id, len(frame_paths), workers)

            segment_results: list[tuple[int, Path, float, str]] = []
            encode_errors: list[tuple[int, BaseException]] = []
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures: dict = {
                    pool.submit(
                        _render_one_slide,
                        idx, frame_path, slides.get(idx, {}),
                        audio_dir, segments_dir, run_id, len(frame_paths),
                    ): idx
                    for idx, frame_path in enumerate(frame_paths)
                }
                for future in as_completed(futures):
                    slide_idx = futures[future]
                    try:
                        segment_results.append(future.result())
                    except Exception as exc:
                        encode_errors.append((slide_idx, exc))
                        log.error("run_id=%s: slide %d encode failed: %s", run_id, slide_idx, exc)
                        for pending in futures:
                            pending.cancel()


            if encode_errors:
                failed_indices = sorted(idx for idx, _ in encode_errors)
                raise RuntimeError(
                    f"encoding failed for slide(s) {failed_indices}: {encode_errors[0][1]}"
                )


            segment_results.sort(key=lambda t: t[0])
            segment_paths = [t[1] for t in segment_results]

            concat_file = workdir / "segments.txt"
            concat_file.write_text(
                "\n".join(f"file '{segment.as_posix()}'" for segment in segment_paths),
                encoding="utf-8",
            )
            final_video = workdir / "final_video.mp4"
            _run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(concat_file),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(final_video),
                ]
            )

            output_key = f"{user_id}/{paper_id}/runs/{run_id}/ffmpeg_stitch/final_video.mp4"
            output_path = storage.upload_file(str(final_video), output_key, content_type="video/mp4")
            log.info("run_id=%s: no-subs video uploaded to %s", run_id, output_path)


            global_cues: list[tuple[float, float, str]] = []
            cursor = 0.0
            for _idx, _seg_path, seg_duration, seg_narration in segment_results:
                if seg_narration.strip():
                    seg_cues = _split_narration_into_cues(
                        seg_narration, seg_duration
                    )
                    for s, e, t in seg_cues:
                        global_cues.append((cursor + s, cursor + e, t))
                cursor += seg_duration

            output_path_subs = output_path  # fallback if subs build fails
            if global_cues:
                global_ass = workdir / "global_subs.ass"
                _write_ass(global_cues, global_ass)
                final_video_subs = workdir / "final_video_subs.mp4"

                _run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        "final_video.mp4",
                        "-vf",
                        # Use explicit key form for compatibility with newer ffmpeg parsers.
                        f"subtitles=filename={global_ass.name}",
                        "-c:a",
                        "copy",
                        "-movflags",
                        "+faststart",
                        "final_video_subs.mp4",
                    ],
                    cwd=str(workdir),
                )
                subs_key = f"{user_id}/{paper_id}/runs/{run_id}/ffmpeg_stitch/final_video_subs.mp4"
                output_path_subs = storage.upload_file(
                    str(final_video_subs), subs_key, content_type="video/mp4"
                )
                log.info(
                    "run_id=%s: with-subs video uploaded to %s", run_id, output_path_subs
                )

        wh.send_webhook(
            {
                "run_id": run_id,
                "step_id": step_id,
                "step_name": "ffmpeg_stitch",
                "status": "completed",
                "gcs_output_path": output_path,
                "gcs_output_path_with_subs": output_path_subs,
                "error_message": "",
                "next_step": "",
                "next_job_data": {},
            }
        )
        rdb.xack(STREAM, GROUP, msg_id)
        log.info("run_id=%s: frame-based video complete", run_id)
    except Exception as exc:
        log.exception("run_id=%s: frame-based video failed", run_id)
        try:
            wh.send_webhook(
                {
                    "run_id": run_id,
                    "step_id": step_id,
                    "step_name": "ffmpeg_stitch",
                    "status": "failed",
                    "gcs_output_path": "",
                    "error_message": str(exc),
                    "next_step": "",
                    "next_job_data": {},
                }
            )
        except Exception:
            pass
