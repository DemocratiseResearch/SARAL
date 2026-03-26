import os
from pathlib import Path
from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips, CompositeVideoClip, TextClip, ColorClip, ImageClip
import wave
import subprocess
import shlex
from PIL import Image, ImageDraw, ImageFont
import textwrap
import re
from typing import Dict, List, Optional



def generate_dialogue_video(paper_id, audio_count, reel_bg_path, dialogues=None, character_mapping=None):
    """
    Generate dialogue video with customizable avatars.
    
    Args:
        paper_id: Unique identifier for the reel
        audio_count: Number of audio clips
        reel_bg_path: Path to background video
        dialogues: Optional dialogue text (for overlay, currently not used)
        character_mapping: Dict mapping character names to avatar filenames
                          e.g., {"Rohan": "prof1.png", "Aisha": "student1.png"}
    """
    # Get the current file's directory and work backwards to find the backend root
    current_file = Path(__file__).resolve()
    backend_root = current_file.parent.parent.parent  # Go up from services -> app -> backend
    
    
    temp_videos_dir = Path(f"temp/reels/{paper_id}")
    os.makedirs(temp_videos_dir, exist_ok=True)
    
    # Assets directory
    assets_dir = backend_root / "app" / "assets"

    # Initialize variables for cleanup
    a_video = None
    k_video = None
    video_clips = []
    final_video = None
    
    try : 
        # Determine avatars from mapping or use defaults
        if character_mapping:
            male_avatar = character_mapping.get("Rohan") or character_mapping.get("K") or character_mapping.get("Person2") or "prof.png"
            female_avatar = character_mapping.get("Aisha") or character_mapping.get("A") or character_mapping.get("Person1") or "student.png"
        else:
            # Default behavior for backwards compatibility
            male_avatar = "prof.png"
            female_avatar = "student.png"
        
        if not reel_bg_path:
            reel_bg_path = assets_dir / "bg3.mp4"
        print(f"[VIDEO] Using male avatar: {male_avatar}, female avatar: {female_avatar}")
        print(f"[VIDEO] reel_bg_path: {reel_bg_path}")
        
        # Create two videos by overlaying each character (store in temp first)
        # Female avatar (bottom left)
        subprocess.run(shlex.split(f'ffmpeg -y -i {reel_bg_path} -i {assets_dir}/{female_avatar} -filter_complex "[0:v][1:v] overlay=0:H-h:enable=\'between(t,0,60)\'" -pix_fmt yuv420p -c:a copy {temp_videos_dir}/Person1_video.mp4'))
        # Male avatar (bottom right)
        subprocess.run(shlex.split(f'ffmpeg -y -i {reel_bg_path} -i {assets_dir}/{male_avatar} -filter_complex "[0:v][1:v] overlay=W-w:H-h:enable=\'between(t,0,60)\'" -pix_fmt yuv420p -c:a copy {temp_videos_dir}/Person2_video.mp4'))

        # Then load both videos using absolute paths
        a_video = VideoFileClip(str(temp_videos_dir / "Person1_video.mp4"))
        k_video = VideoFileClip(str(temp_videos_dir / "Person2_video.mp4"))

        curstart = 0
        video_clips = []
        print(f"[VIDEO] Processing {audio_count} audio files for video generation")
        
        for i in range(audio_count):
            # Audio directory
            audio_dir = backend_root / "temp" / "audio" / paper_id
            
            # Try to find the actual audio file that was created
            # The files are named as {index:02d}_{character}.wav based on the dialogue

            audio_file_person1 = audio_dir / f"{i:02d}_Person1.wav"
            audio_file_person2 = audio_dir / f"{i:02d}_Person2.wav"
            audio_file_a = audio_dir / f"{i:02d}_A.wav"
            audio_file_k = audio_dir / f"{i:02d}_K.wav"
            
            print(f"[VIDEO] Turn {i}: Checking for audio files...")
            print(f"[VIDEO]   Person1 file: {audio_file_person1} | Exists: {audio_file_person1.exists()}")
            print(f"[VIDEO]   Person2 file: {audio_file_person2} | Exists: {audio_file_person2.exists()}")
            
            # Determine which file exists
            if audio_file_person1.exists():
                audio_path = audio_file_person1
                is_female = True
                print(f"[VIDEO]   ✓ Using female audio: {audio_file_person1.name}")
            elif audio_file_person2.exists():
                audio_path = audio_file_person2
                is_female = False
                print(f"[VIDEO]   ✓ Using male audio: {audio_file_person2.name}")
            else:
                print(f"[VIDEO] ⚠ No audio file found for index {i}")
                # List what files exist in the directory
                if audio_dir.exists():
                    existing_files = list(audio_dir.glob("*.wav"))
                    print(f"[VIDEO]   Available files: {[f.name for f in existing_files]}")
                continue
            
            # 1. Create audio clip using absolute path
            audio_clip = AudioFileClip(str(audio_path))
            
            # 2. Create video subclip based on which character
            if is_female:
                # Use female avatar video
                video_clip = a_video.subclip(curstart, curstart + audio_clip.duration)
            else:
                # Use male avatar video
                video_clip = k_video.subclip(curstart, curstart + audio_clip.duration)
            curstart += audio_clip.duration
            
            # 3. Combine the audio with the video
            video_clip = video_clip.set_audio(audio_clip)
            
            video_clips.append(video_clip)

        final_video = concatenate_videoclips(video_clips, method="compose")

        # DON'T close clips here! final_video still needs them during write_videofile
        # Clips will be closed in the finally block after write completes

        # Save final output to 'gen' directory like podcasts do
        output_path = temp_videos_dir / "reel_output.mp4"
        
        # Get GPU-aware encoding configuration
        from app.utils.gpu_utils import get_fast_video_encoding_config
        encoding_config = get_fast_video_encoding_config()
        
        # Write video with proper encoding config and resource management
        # CRITICAL: Use unique temp audiofile name to avoid conflicts
        import uuid
        temp_audio = f'temp-audio-{uuid.uuid4().hex[:8]}.m4a'
        
        # Try GPU encoding first, fallback to CPU if it fails
        write_success = False
        for attempt in [1, 2]:
            try:
                if attempt == 2:
                    print("⚠️  GPU encoding failed, falling back to CPU encoding...")
                    encoding_config = {
                        "codec": "libx264",
                        "preset": "ultrafast",
                        "threads": 8,
                        "ffmpeg_params": ["-pix_fmt", "yuv420p"],
                        "hardware": "CPU (fallback)",
                    }
                
                final_video.write_videofile(
                    str(output_path),
                    fps=30,
                    codec=encoding_config["codec"],
                    audio_codec='aac',
                    temp_audiofile=temp_audio,
                    remove_temp=True,
                    preset=encoding_config.get("preset"),
                    threads=encoding_config.get("threads"),
                    ffmpeg_params=encoding_config["ffmpeg_params"],
                    logger=None,
                    write_logfile=False
                )
                write_success = True
                break
                
            except (IOError, OSError) as e:
                error_msg = str(e)
                if attempt == 1 and ('nvenc' in error_msg.lower() or 'encoder not found' in error_msg.lower()):
                    print(f"GPU encoding error: {error_msg}")
                    continue
                else:
                    raise
        
        if not write_success:
            raise RuntimeError("Failed to write video with both GPU and CPU encoding")
        
        # Ensure temp audio file is cleaned up
        try:
            if os.path.exists(temp_audio):
                os.remove(temp_audio)
        except:
            pass

        # Return the absolute path to the generated video in gen directory
        return str(output_path)
    
    except Exception as e:
        print(f"Error generating dialogue video: {e}")
        import traceback
        traceback.print_exc()
        raise

    finally :
        # CRITICAL: Always clean up resources in finally block
        print("Cleaning up video resources...")
        
        # Close individual clips
        if video_clips:
            for clip in video_clips:
                try:
                    clip.close()
                except Exception as e:
                    print(f"Warning: Error closing clip: {e}")
        
        # Close source videos
        if a_video is not None:
            try:
                a_video.close()
            except Exception as e:
                print(f"Warning: Error closing a_video: {e}")
        
        if k_video is not None:
            try:
                k_video.close()
            except Exception as e:
                print(f"Warning: Error closing k_video: {e}")
        
        # Close final video
        if final_video is not None:
            try:
                final_video.close()
            except Exception as e:
                print(f"Warning: Error closing final_video: {e}")
        
        print("Video resource cleanup complete")


def safe_filename(s: str) -> str:
    s = re.sub(r"[^0-9A-Za-z \-_.]", "", s)
    s = re.sub(r"\s+", "_", s).strip("_")
    return s[:200] if s else "untitled"

def _load_font(preferred="DejaVuSans-Bold.ttf", size=36):
    """Try to load a TTF font; fall back to default Pillow font if unavailable."""
    try:
        return ImageFont.truetype(preferred, size)
    except Exception:
        try:
            # common alternative
            return ImageFont.truetype("Arial.ttf", size)
        except Exception:
            return ImageFont.load_default()


def fallback_parse(paper_text: str) -> Dict:
    """
    Improved heuristic parser:
    - Take text up to 'ABSTRACT' (if present).
    - Try to find a run-on block of capitalized words that looks like author names.
    - Stop the author block at the first token that looks like an affiliation/email (lowercase, digits, contains '@' or 'www' or looks like domain).
    - Chunk the author tokens into likely author names (2-4 words per author) using simple heuristics.
    """
    # print("paper_text", paper_text)
    text = (paper_text or "").strip()
    if not text:
        return {"title": "Untitled", "authors": []}

    # 1) prefer everything before 'ABSTRACT'
    parts = re.split(r"\bABSTRACT\b", text, flags=re.I)
    head = parts[0].strip()

    # If head is huge, limit to first ~600 chars to avoid scanning whole paper body
    head = head[:2000]

    # 2) Try to find a candidate author block: a run of words that start with an uppercase letter.
    # The author block often follows the title; find the earliest appearance of a pattern like:
    # "Firstname Lastname Firstname Lastname ..." (2+ capitalized words in a row)
    # We allow up to many consecutive capitalized words.
    cap_seq_re = re.compile(
        r"([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+){1,8}(?:\s+[A-Z][A-Za-z'`-]+)*)"
    )

    match_iter = list(cap_seq_re.finditer(head))
    # choose the longest plausible match that isn't at the very start (to avoid picking the start of the title)
    candidate = None
    for m in match_iter:
        s, e = m.span()
        # Skip very early matches (likely part of title). Prefer matches after first 20 chars.
        if s > 10 and (e - s) > 20:
            candidate = m.group(1)
            break

    # If no candidate found, fall back to a simpler heuristic:
    if not candidate:
        # split head into lines and pick the longest line as title; next line(s) as authors
        lines = [ln.strip() for ln in head.splitlines() if ln.strip()]
        print("title data", lines(0))
        print("next line", lines(1))
        title = lines[0] if lines else "Untitled"
        authors = []
        if len(lines) >= 2:
            # take second line and try to parse authors from it
            second = lines[1]
            # split on common separators
            parts = re.split(r"[;,]| and ", second)
            authors = [p.strip() for p in parts if p.strip() and len(p.split()) <= 6]
        return {"title": title, "authors": authors}

    # Now candidate is a run of capitalized words; however it may include part of the title.
    # We'll try to split head at the start of candidate to get the title.
    start = head.find(candidate)
    possible_title = head[:start].strip()
    if not possible_title:
        # If title wasn't found before candidate, try the first long line heuristic
        lines = [ln.strip() for ln in head.splitlines() if ln.strip()]
        possible_title = lines[0] if lines else "Untitled"

    # 3) Trim candidate at first sign of affiliation/email/domain which often follows authors.
    tokens = candidate.split()
    author_tokens = []
    for t in tokens:
        # consider token as affiliation/email if:
        # - contains '@' or '.' and no leading capital OR contains digits (common in ids like cs19d504)
        # - or token is all lowercase (affiliation)
        if re.search(r"@", t) or re.search(r"\d", t) or (t.lower() == t and len(t) > 1) or re.search(r"\.[a-z]{2,}", t):
            break
        author_tokens.append(t)

    # If no tokens captured (very conservative), fallback to splitting candidate naively by commas
    if not author_tokens:
        raw_authors = re.split(r"[;,]| and ", candidate)
        authors = [a.strip() for a in raw_authors if a.strip()]
        return {"title": possible_title or "Untitled", "authors": authors}

    # 4) Chunk author_tokens into plausible author names.
    # Heuristic: try chunk sizes 3, then 2, then 4. Choose first that divides evenly or produces 2-6 authors.
    n = len(author_tokens)
    def chunk_by_size(size):
        return [" ".join(author_tokens[i:i+size]) for i in range(0, n, size)]

    authors = []
    for sz in (3, 2, 4):
        if n % sz == 0:
            authors = chunk_by_size(sz)
            break
    if not authors:
        # If not divisible, try to produce between 1 and 6 authors by splitting greedily:
        # prefer making chunks of 3 then 2 when remainder small
        authors = []
        i = 0
        while i < n:
            remain = n - i
            if remain % 3 == 0 or remain >= 3:
                take = 3
            elif remain % 2 == 0 or remain >= 2:
                take = 2
            else:
                take = 1
            authors.append(" ".join(author_tokens[i:i+take]))
            i += take

    # cleanup: remove tiny fragments, strip punctuation
    authors = [re.sub(r"^[,;:\s]+|[,;:\s]+$", "", a).strip() for a in authors if len(a.strip()) > 1]
    # dedupe and keep reasonable ones
    seen = set()
    final_authors = []
    for a in authors:
        if a not in seen and 1 <= len(a.split()) <= 6:
            final_authors.append(a)
            seen.add(a)

    # final fallback
    if not possible_title:
        possible_title = "Untitled"

    return {"title": possible_title, "authors": final_authors}

def _create_title_image(title: str, author: str, size=(480, 850),
                        title_font_size=34, author_font_size=24,
                        margin=20, horizontal_padding=40) -> Image.Image:
    """
    Create white background image with:
    - Title at top with left/right padding
    - Author centered vertically
    - No clipping on any device resolution
    """
    W, H = size

    img = Image.new("RGB", (W, H), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    title_font = _load_font(size=title_font_size)
    author_font = _load_font(size=author_font_size)

    # -------------- measure helper ----------------
    def measure(text, font):
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]

    # -------------- WRAP TITLE WITH PADDING ----------------
    usable_width = W - horizontal_padding * 2

    # dynamic wrap: keep reducing width until each line fits inside usable width
    def wrap_text_to_width(text, font, max_width):
        words = text.split()
        lines = []
        current = words[0]

        for w in words[1:]:
            test = current + " " + w
            tw, _ = measure(test, font)
            if tw <= max_width:
                current = test
            else:
                lines.append(current)
                current = w
        lines.append(current)
        return lines

    title_lines = wrap_text_to_width(title, title_font, usable_width)

    # draw title
    y = margin
    for line in title_lines:
        tw, th = measure(line, title_font)
        x = (W - tw) / 2
        draw.text((x, y), line, font=title_font, fill=(0, 0, 0))
        y += th + 8

    # -------------- AUTHOR BLOCK ----------------
    if author:
        author_lines = wrap_text_to_width(author, author_font, usable_width)
        total_h = sum(measure(l, author_font)[1] + 4 for l in author_lines)
        start_y = (H - total_h) / 2
        yy = start_y

        for line in author_lines:
            tw, th = measure(line, author_font)
            x = (W - tw) / 2
            draw.text((x, yy), line, font=author_font, fill=(0, 0, 0))
            yy += th + 4

    return img


def generate_title_video_from_text(
    paper_text: dict,
    paper_id: str,
    gemini_api_key: str = None,
    out_dir: str = None,
    duration: int = 120,
    size=(480,850),
):
    """
    Generates a white-background MP4 (size, duration) with title (top) and authors (center).
    Returns the output MP4 path.
    """
    from app.utils.gpu_utils import get_video_encoding_config
    
    # determine output directory
    # out_dir can be a directory path or exact filename
    out_path = Path(out_dir)
    if out_path.is_dir():
        out_path = out_path / f"title_bg.mp4"
    
    title = paper_text.get("title", "")
    authors = paper_text.get("authors", "")
    print("authors", authors)
    authors_list = [a.strip() for a in authors.split(";") if a.strip()]
    print("type()", type(authors))
    author_temp = authors_list[0]
    author = author_temp + "  et al."
    # If out_path was set from out_dir param, ensure parent exists
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # print("paper_text", paper_text)
    # Extract title/authors for rendering if not already done
    
    print("title", title)
    print("author", author)
    
    img = None
    clip = None
    tmp_img_path = None
    
    try:
        # create PNG with PIL
        img = _create_title_image(title, author, size=size)
        tmp_img_path = out_path.with_suffix(".png")
        img.save(tmp_img_path, format="PNG")
        
        # CRITICAL: Close PIL image immediately after save to release file handle
        img.close()
        img = None
        
        # make video clip from single image
        clip = ImageClip(str(tmp_img_path)).set_duration(duration).resize(newsize=size)
        
        # Get GPU-aware encoding configuration
        encoding_config = get_video_encoding_config()
        
        # Try GPU encoding first, fallback to CPU if it fails
        write_success = False
        for attempt in [1, 2]:
            try:
                if attempt == 2:
                    print("⚠️  GPU encoding failed, falling back to CPU encoding...")
                    encoding_config = {
                        "codec": "libx264",
                        "preset": "medium",
                        "threads": 4,
                        "ffmpeg_params": ["-pix_fmt", "yuv420p"],
                        "hardware": "CPU (fallback)",
                    }
                
                clip.write_videofile(
                    str(out_path),
                    fps=24,
                    codec=encoding_config["codec"],
                    audio=False,
                    preset=encoding_config.get("preset"),
                    threads=encoding_config.get("threads"),
                    ffmpeg_params=encoding_config["ffmpeg_params"],
                    logger=None,
                    write_logfile=False
                )
                write_success = True
                break
                
            except (IOError, OSError) as e:
                error_msg = str(e)
                if attempt == 1 and ('nvenc' in error_msg.lower() or 'encoder not found' in error_msg.lower()):
                    print(f"GPU encoding error: {error_msg}")
                    continue
                else:
                    raise
        
        if not write_success:
            raise RuntimeError("Failed to write video with both GPU and CPU encoding")
        
        print(f"Title video created successfully: {out_path}")
        return str(out_path)
        
    except Exception as e:
        print(f"Error creating title video: {e}")
        import traceback
        traceback.print_exc()
        raise
        
    finally:
        # CRITICAL: Always clean up resources
        print("Cleaning up title video resources...")
        
        # Close PIL image if still open
        if img is not None:
            try:
                img.close()
            except Exception as e:
                print(f"Warning: Error closing PIL image: {e}")
        
        # Close clip
        if clip is not None:
            try:
                clip.close()
            except Exception as e:
                print(f"Warning: Error closing clip: {e}")
        
        # cleanup temporary png
        if tmp_img_path is not None:
            try:
                tmp_img_path.unlink()
            except Exception as e:
                print(f"Warning: Error deleting temp PNG: {e}")
        
        print("Title video resource cleanup complete")



