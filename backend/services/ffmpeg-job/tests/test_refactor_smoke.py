import sys
import types
from pathlib import Path

_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVICE_DIR))


def _install_stubs() -> None:
    if "saral_shared" not in sys.modules:
        pkg = types.ModuleType("saral_shared")
        pkg.__path__ = []
        storage_client = types.ModuleType("saral_shared.storage_client")
        webhook_client = types.ModuleType("saral_shared.webhook_client")
        for name in (
            "list_objects", "download_to_file", "upload_file",
            "download_json", "upload_bytes", "generate_presigned_url",
        ):
            setattr(storage_client, name, lambda *a, **k: None)
        webhook_client.send_webhook = lambda *a, **k: None
        pkg.storage_client = storage_client
        pkg.webhook_client = webhook_client
        sys.modules["saral_shared"] = pkg
        sys.modules["saral_shared.storage_client"] = storage_client
        sys.modules["saral_shared.webhook_client"] = webhook_client

    if "redis" not in sys.modules:
        redis_mod = types.ModuleType("redis")
        exceptions = types.ModuleType("redis.exceptions")
        exceptions.ResponseError = type("ResponseError", (Exception,), {})
        exceptions.ConnectionError = type("ConnectionError", (Exception,), {})
        redis_mod.exceptions = exceptions
        redis_mod.from_url = lambda *a, **k: None
        sys.modules["redis"] = redis_mod
        sys.modules["redis.exceptions"] = exceptions

    if "dotenv" not in sys.modules:
        dotenv_mod = types.ModuleType("dotenv")
        dotenv_mod.load_dotenv = lambda *a, **k: None
        sys.modules["dotenv"] = dotenv_mod


def test_all_modules_import_and_dispatch_is_wired():
    _install_stubs()

    import config
    import ffmpeg_utils
    import imaging
    import media_io
    import reel
    import slides
    import subtitles
    import waveform
    import job

    assert config.STREAM == "saral:jobs:ffmpeg"
    assert config.GROUP == "saral-workers"

    assert job._process_waveform_video is waveform._process_waveform_video
    assert job._process_frame_based_video is slides._process_frame_based_video
    assert job._process_reel_video is reel._process_reel_video

    assert callable(ffmpeg_utils._run)
    assert callable(subtitles._split_narration_into_cues)
    assert callable(media_io._download_avatars)
    assert callable(imaging._load_font)


def test_cue_timing_is_proportional_and_pinned():
    _install_stubs()
    from subtitles import _split_narration_into_cues

    assert _split_narration_into_cues("", 10.0) == []
    assert _split_narration_into_cues("hello world", 0) == []

    cues = _split_narration_into_cues("one two three four five six seven eight nine ten", 10.0)
    assert cues
    assert cues[0][0] == 0.0
    assert cues[-1][1] == 10.0
    for (s0, e0, _), (s1, _e1, _t) in zip(cues, cues[1:]):
        assert e0 <= s1 + 1e-9
        assert s1 == e0


def test_ass_timestamp_formatting():
    _install_stubs()
    from subtitles import _format_ass_timestamp

    assert _format_ass_timestamp(0) == "0:00:00.00"
    assert _format_ass_timestamp(-5) == "0:00:00.00"
    assert _format_ass_timestamp(65.5) == "0:01:05.50"
    assert _format_ass_timestamp(3661.25) == "1:01:01.25"
    assert _format_ass_timestamp(1.999) == "0:00:02.00"


def test_write_ass_roundtrip(tmp_path=None):
    _install_stubs()
    from subtitles import _write_ass, _ASS_HEADER

    out = _SERVICE_DIR / "tests" / "_tmp_smoke.ass"
    try:
        _write_ass([(0.0, 1.5, "hello world")], out)
        content = out.read_text(encoding="utf-8")
        assert content.startswith("[Script Info]")
        assert "Dialogue: 0,0:00:00.00,0:00:01.50,Default" in content
        assert _ASS_HEADER in content
    finally:
        out.unlink(missing_ok=True)


if __name__ == "__main__":
    test_all_modules_import_and_dispatch_is_wired()
    test_cue_timing_is_proportional_and_pinned()
    test_ass_timestamp_formatting()
    test_write_ass_roundtrip()
    print("OK: all ffmpeg-job refactor smoke tests passed")
