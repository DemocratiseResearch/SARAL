"""
Test script for podcast video generation (cover image + FFmpeg video).

Usage:
    1. Add your GEMINI_API_KEY below (or set it as an environment variable)
    2. Run:  python test_podcast_video.py
    3. Test with a specific PDF:  python test_podcast_video.py path/to/paper.pdf

It runs 3 tests:
    Test 1: Gemini cover image generation (needs valid API key)
    Test 2: Fallback cover (gradient + title text via FFmpeg, no API key needed)
    Test 3: Video generation from cover + dummy audio (needs FFmpeg)

Or, when a PDF is provided:
    - Extracts title & abstract from the PDF
    - Generates cover image (Gemini with FFmpeg fallback)
    - Creates video from cover + dummy audio

No Redis, no Firebase, no Sarvam -- just FFmpeg + optionally a Gemini key.
"""

import os
import sys
import subprocess
import wave
import base64

# ------------------------------------------------
# CONFIG: Set your API key here if not in env
# ------------------------------------------------
GEMINI_API_KEY = None  # <-- paste key or leave blank
# ------------------------------------------------

if GEMINI_API_KEY:
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY


# =====================================================================
# Functions copied from podcast_service.py so we don't need any imports
# =====================================================================

def generate_podcast_cover(paper_title, paper_abstract, paper_id):
    """Generate cover image via Gemini Imagen REST API, with FFmpeg fallback."""
    import requests

    images_dir = os.path.join("temp", "images")
    os.makedirs(images_dir, exist_ok=True)
    cover_path = os.path.join(images_dir, f"podcast_cover_{paper_id}.png")

    try:
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY not set")

        prompt = (
            f"Abstract scientific illustration representing: {paper_title}. "
            "Style: modern, minimal, dark background, no text. 16:9 landscape."
        )

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            "gemini-2.5-flash-image:generateContent"
            f"?key={gemini_api_key}"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }

        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates", [])
        if candidates:
            for part in candidates[0].get("content", {}).get("parts", []):
                if "inlineData" in part:
                    image_bytes = base64.b64decode(part["inlineData"]["data"])
                    with open(cover_path, "wb") as f:
                        f.write(image_bytes)
                    print(f"  [Gemini] Cover image saved: {cover_path}")
                    return cover_path

        raise ValueError("No image data in Gemini API response")

    except Exception as e:
        print(f"  [Gemini] Failed: {e} -- falling back to FFmpeg")
        return _create_fallback_cover(paper_title, cover_path)


def _create_fallback_cover(paper_title, cover_path):
    """Dark background + title text via FFmpeg."""
    import platform

    display_title = paper_title[:80] + "..." if len(paper_title) > 80 else paper_title
    display_title = display_title.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")

    # Windows needs explicit font path; Linux/Mac use fontconfig
    if platform.system() == "Windows":
        font_opt = "fontfile='C\\:/Windows/Fonts/arial.ttf':"
    else:
        font_opt = ""

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", "color=c=#1a1a2e:s=1920x1080:d=1",
        "-vf", (
            f"drawtext=text='{display_title}'"
            f":{font_opt}fontsize=48:fontcolor=white"
            ":x=(w-text_w)/2:y=(h-text_h)/2"
            ":shadowcolor=black:shadowx=2:shadowy=2"
            ",format=yuv420p"
        ),
        "-frames:v", "1",
        "-update", "1",
        cover_path,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and os.path.exists(cover_path):
            print(f"  [Fallback] Cover with title saved: {cover_path}")
            return cover_path
        else:
            print(f"  [Fallback] drawtext cmd failed (rc={result.returncode})")
    except Exception as e:
        print(f"  [Fallback] drawtext error: {e}")

    # Last resort: plain dark image (no text)
    cmd_simple = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "color=c=#1a1a2e:s=1920x1080:d=1",
        "-frames:v", "1",
        "-update", "1",
        cover_path,
    ]
    try:
        subprocess.run(cmd_simple, capture_output=True, text=True, timeout=15)
    except Exception:
        pass

    if os.path.exists(cover_path):
        print(f"  [Fallback] Plain dark cover saved: {cover_path}")
        return cover_path

    raise RuntimeError("Failed to generate any cover image")


def generate_podcast_video(audio_path, cover_image_path, paper_id):
    """Combine cover image + audio into MP4."""
    output_dir = os.path.join("temp", "podcast", paper_id)
    os.makedirs(output_dir, exist_ok=True)
    video_path = os.path.join(output_dir, "podcast_video.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", cover_image_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-shortest",
        "-movflags", "+faststart",
        video_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg video failed: {result.stderr[:300]}")

    print(f"  Video created: {video_path}")
    return video_path


# =====================================================================
# Helpers
# =====================================================================

def check_ffmpeg():
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    except FileNotFoundError:
        return False


def create_dummy_wav(path, duration_seconds=5):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sample_rate = 44100
    num_samples = sample_rate * duration_seconds
    with wave.open(path, "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * num_samples)
    print(f"  Created dummy WAV ({duration_seconds}s): {path}")


def extract_title_abstract_from_pdf(pdf_path):
    """Extract title and abstract from a PDF using PyMuPDF."""
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    full_text = ""
    # Read first 3 pages (enough for title + abstract)
    for page_num in range(min(3, len(doc))):
        full_text += doc[page_num].get_text()
    doc.close()

    lines = [l.strip() for l in full_text.split("\n") if l.strip()]

    # Title: first non-empty line (usually the largest text on page 1)
    title = lines[0] if lines else "Untitled Paper"

    # Abstract: look for "Abstract" section
    abstract = ""
    for i, line in enumerate(lines):
        if line.lower().startswith("abstract"):
            # Grab text after "Abstract" keyword until next section or 500 chars
            abstract_lines = []
            # Include rest of the "Abstract" line if it has content after the keyword
            rest = line[len("abstract"):].strip().lstrip(".:- ")
            if rest:
                abstract_lines.append(rest)
            for j in range(i + 1, min(i + 30, len(lines))):
                # Stop at next section header (short line followed by longer content)
                if lines[j].lower() in ("introduction", "1 introduction", "1. introduction", "keywords"):
                    break
                abstract_lines.append(lines[j])
                if sum(len(l) for l in abstract_lines) > 500:
                    break
            abstract = " ".join(abstract_lines)
            break

    if not abstract:
        # Fallback: use first 500 chars of text
        abstract = " ".join(lines[1:])[:500]

    print(f"  Extracted title: {title[:80]}...")
    print(f"  Extracted abstract: {abstract[:120]}...")
    return title, abstract


# =====================================================================
# Tests
# =====================================================================

def test_gemini_cover():
    print("\n" + "=" * 60)
    print("TEST 1: Gemini cover image generation (Imagen REST API)")
    print("=" * 60)

    if not os.getenv("GEMINI_API_KEY"):
        print("  SKIPPED - No GEMINI_API_KEY set.")
        return None

    try:
        cover = generate_podcast_cover(
            "Quantum Entanglement in Neural Networks",
            "We study the application of quantum computing principles to deep learning.",
            "test-gemini-cover",
        )
        size = os.path.getsize(cover)
        print(f"  PASSED - {cover} ({size:,} bytes)")
        return cover
    except Exception as e:
        print(f"  FAILED - {e}")
        return None


def test_fallback_cover():
    print("\n" + "=" * 60)
    print("TEST 2: Fallback cover (FFmpeg gradient + title)")
    print("=" * 60)

    if not check_ffmpeg():
        print("  SKIPPED - FFmpeg not found.")
        return None

    saved_key = os.environ.pop("GEMINI_API_KEY", None)
    try:
        cover = generate_podcast_cover(
            "Attention Is All You Need: Transformer Architecture",
            "We propose a new network architecture based solely on attention mechanisms.",
            "test-fallback-cover",
        )
        size = os.path.getsize(cover)
        print(f"  PASSED - {cover} ({size:,} bytes)")
        return cover
    except Exception as e:
        print(f"  FAILED - {e}")
        return None
    finally:
        if saved_key:
            os.environ["GEMINI_API_KEY"] = saved_key


def test_video_generation(cover_path=None):
    print("\n" + "=" * 60)
    print("TEST 3: Video generation (cover + audio -> MP4)")
    print("=" * 60)

    if not check_ffmpeg():
        print("  SKIPPED - FFmpeg not found.")
        return

    # Get a cover image if none provided
    if not cover_path or not os.path.exists(cover_path):
        print("  No cover from previous tests, creating fallback...")
        saved_key = os.environ.pop("GEMINI_API_KEY", None)
        try:
            cover_path = generate_podcast_cover("Test Paper", "abstract", "test-video")
        except Exception as e:
            print(f"  FAILED - Could not create cover: {e}")
            return
        finally:
            if saved_key:
                os.environ["GEMINI_API_KEY"] = saved_key

    paper_id = "test-video-gen"
    dummy_wav = os.path.join("temp", "podcast", paper_id, "podcast_full.wav")
    create_dummy_wav(dummy_wav, duration_seconds=5)

    try:
        video_path = generate_podcast_video(dummy_wav, cover_path, paper_id)
        size = os.path.getsize(video_path)
        print(f"  PASSED - {video_path} ({size:,} bytes)")
        print(f'  Play it:  ffplay "{video_path}"')
    except Exception as e:
        print(f"  FAILED - {e}")


# =====================================================================
# PDF Test
# =====================================================================

def test_with_pdf(pdf_path):
    """Test cover image + video generation using a real PDF paper."""
    print("\n" + "=" * 60)
    print(f"PDF TEST: {os.path.basename(pdf_path)}")
    print("=" * 60)

    if not os.path.exists(pdf_path):
        print(f"  ERROR - File not found: {pdf_path}")
        return

    if not check_ffmpeg():
        print("  SKIPPED - FFmpeg not found.")
        return

    # Extract title and abstract from PDF
    print("\n  Step 1: Extracting title & abstract from PDF...")
    try:
        title, abstract = extract_title_abstract_from_pdf(pdf_path)
    except Exception as e:
        print(f"  FAILED - Could not extract text: {e}")
        return

    # Generate a paper_id from filename
    paper_id = f"pdf-{os.path.splitext(os.path.basename(pdf_path))[0]}"
    # Sanitize paper_id (remove spaces/special chars)
    paper_id = "".join(c if c.isalnum() or c in "-_" else "-" for c in paper_id)

    # Generate cover image
    print("\n  Step 2: Generating cover image...")
    try:
        cover_path = generate_podcast_cover(title, abstract, paper_id)
        size = os.path.getsize(cover_path)
        print(f"  PASSED - Cover: {cover_path} ({size:,} bytes)")
    except Exception as e:
        print(f"  FAILED - Cover generation: {e}")
        return

    # Generate video with dummy audio
    print("\n  Step 3: Generating video (cover + dummy audio)...")
    dummy_wav = os.path.join("temp", "podcast", paper_id, "podcast_full.wav")
    create_dummy_wav(dummy_wav, duration_seconds=5)

    try:
        video_path = generate_podcast_video(dummy_wav, cover_path, paper_id)
        size = os.path.getsize(video_path)
        print(f"  PASSED - Video: {video_path} ({size:,} bytes)")
        print(f'  Play it:  ffplay "{video_path}"')
    except Exception as e:
        print(f"  FAILED - Video generation: {e}")
        return

    # Summary
    print("\n" + "-" * 40)
    print("  OUTPUT FILES:")
    print(f"    Cover: {cover_path}")
    print(f"    Video: {video_path}")
    print(f"    Title: {title[:80]}")


# =====================================================================
# Main
# =====================================================================

def pick_pdf_file():
    """Open a file dialog to select a PDF file."""
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()  # Hide the main window
    root.attributes("-topmost", True)  # Bring dialog to front

    pdf_path = filedialog.askopenfilename(
        title="Select a PDF paper",
        filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
    )

    root.destroy()
    return pdf_path if pdf_path else None


def main():
    # If a PDF path is provided via argument, use it
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        # Show menu
        print("Podcast Video Generation - Test Suite")
        print("=" * 60)
        print("  1. Upload a PDF (opens file picker)")
        print("  2. Run default tests (no PDF needed)")
        print("=" * 60)
        choice = input("Choose [1/2]: ").strip()

        if choice == "1":
            print("\nOpening file picker...")
            pdf_path = pick_pdf_file()
            if not pdf_path:
                print("No file selected. Exiting.")
                return
        elif choice == "2":
            pdf_path = None
        else:
            print("Invalid choice. Exiting.")
            return

    print(f"\nWorking dir: {os.getcwd()}")
    print(f"FFmpeg available: {check_ffmpeg()}")
    print(f"GEMINI_API_KEY set: {'yes' if os.getenv('GEMINI_API_KEY') else 'no'}")

    if pdf_path:
        test_with_pdf(pdf_path)
        print("\nDone!")
        return

    # Default: run the 3 standard tests
    gemini_cover = test_gemini_cover()
    fallback_cover = test_fallback_cover()
    test_video_generation(cover_path=gemini_cover or fallback_cover)

    # Summary
    print("\n" + "=" * 60)
    print("OUTPUT FILES:")
    print("=" * 60)
    for f in [
        "temp/images/podcast_cover_test-gemini-cover.png",
        "temp/images/podcast_cover_test-fallback-cover.png",
        "temp/podcast/test-video-gen/podcast_video.mp4",
    ]:
        exists = os.path.exists(f)
        size = f"{os.path.getsize(f):,} bytes" if exists else "not created"
        tag = "OK" if exists else "--"
        print(f"  [{tag}] {f} ({size})")

    print("\nDone!")


if __name__ == "__main__":
    main()
