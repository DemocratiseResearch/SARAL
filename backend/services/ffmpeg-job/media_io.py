"""GCS download and local media assembly helpers (frames, audio, avatars)."""

from pathlib import Path

from saral_shared import storage_client as storage

from ffmpeg_utils import _run


def _download_frames(prefix: str, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    for frame_gcs_path in storage.list_objects(prefix):
        local_path = frames_dir / Path(frame_gcs_path).name
        storage.download_to_file(frame_gcs_path, str(local_path))
        frame_paths.append(local_path)
    return sorted(frame_paths)


def _download_audio_segments(audio_paths: list[str], audio_dir: Path) -> list[Path]:
    audio_dir.mkdir(parents=True, exist_ok=True)
    local_paths: list[Path] = []
    for idx, audio_gcs_path in enumerate(audio_paths):
        local_path = audio_dir / f"part_{idx:02d}.wav"
        storage.download_to_file(audio_gcs_path, str(local_path))
        local_paths.append(local_path)
    return local_paths


def _concat_audio(audio_files: list[Path], output_path: Path) -> Path | None:
    if not audio_files:
        return None
    if len(audio_files) == 1:
        return audio_files[0]

    concat_file = output_path.parent / f"{output_path.stem}.txt"
    concat_file.write_text(
        "\n".join(f"file '{audio_file.as_posix()}'" for audio_file in audio_files),
        encoding="utf-8",
    )
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
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )
    return output_path


def _download_avatars(avatars: dict, dest_dir: Path) -> tuple[Path, Path]:

    person1_gcs = avatars.get("person1")
    person2_gcs = avatars.get("person2")
    if not person1_gcs or not person2_gcs:
        raise RuntimeError("reel manifest missing avatar gs:// paths")

    dest_dir.mkdir(parents=True, exist_ok=True)
    person1_local = dest_dir / "person1.png"
    person2_local = dest_dir / "person2.png"
    storage.download_to_file(person1_gcs, str(person1_local))
    storage.download_to_file(person2_gcs, str(person2_local))
    return person1_local, person2_local
