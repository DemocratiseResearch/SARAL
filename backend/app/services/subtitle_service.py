"""
Subtitle Service for ASS Files
Generates and parses ASS subtitle files with word-level timing
"""

import os
import re
import logging
from typing import List, Dict, Tuple, Any

logging.basicConfig(level=logging.INFO)


def _ass_time(t: float) -> str:
    """Helper function to format time for ASS files (H:MM:SS.cs)."""
    if t < 0:
        t = 0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    cs = int((t - int(t)) * 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


def parse_ass_time(time_str: str) -> float:
    """
    Parse ASS time format (H:MM:SS.CS) to seconds.

    Args:
        time_str: Time string in format H:MM:SS.CS

    Returns:
        Time in seconds as float
    """
    # Format: H:MM:SS.CS (centiseconds)
    match = re.match(r"(\d+):(\d+):(\d+)\.(\d+)", time_str)
    if not match:
        return 0.0

    hours, minutes, seconds, centiseconds = map(int, match.groups())
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100.0


def generate_subtitle_file(
    tokens_with_timestamps: List[Dict], output_audio_path: str
) -> str:
    """
    Generates an ASS subtitle file from tokens with absolute timestamps.

    Args:
        tokens_with_timestamps: List of token dictionaries with 'text', 'start', and 'end' keys
        output_audio_path: Path to the audio file, used to name the subtitle file

    Returns:
        str: The path to the generated subtitle file
    """
    subtitle_file_path = os.path.splitext(output_audio_path)[0] + ".ass"

    with open(subtitle_file_path, "w", encoding="utf-8") as f:
        # Write standard ASS header
        f.write("[Script Info]\n")
        f.write("Title: Generated Subtitles\n")
        f.write("ScriptType: v4.00+\n\n")
        f.write("[V4+ Styles]\n")
        f.write(
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        )
        f.write(
            "Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H003C3C3C,&H00000000,0,0,0,0,100,100,0,0,1,1.5,1,2,10,10,15,1\n\n"
        )
        f.write("[Events]\n")
        f.write(
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

        # Write dialogue entries word-by-word
        for token in tokens_with_timestamps:
            start_time = token.get("start")
            end_time = token.get("end")
            text = token.get("text", "").strip()

            if (
                start_time is not None
                and end_time is not None
                and text
                and end_time > start_time
            ):
                start_formatted = _ass_time(start_time)
                end_formatted = _ass_time(end_time)
                text = text.replace(",", "\\,")
                f.write(
                    f"Dialogue: 0,{start_formatted},{end_formatted},Default,,0,0,0,,{text}\n"
                )

    logging.info(f"✅ Generated subtitle file: {subtitle_file_path}")
    return subtitle_file_path


def parse_ass_subtitle_file(subtitle_path: str) -> List[Dict[str, Any]]:
    """
    Parse ASS subtitle file and extract dialogue entries with timing.

    Args:
        subtitle_path: Path to .ass subtitle file

    Returns:
        List of dialogue entries with start, end, and text
    """
    dialogue_entries = []

    try:
        with open(subtitle_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        in_events = False
        for line in lines:
            line = line.strip()

            if line == "[Events]":
                in_events = True
                continue

            if in_events and line.startswith("Dialogue:"):
                # Parse dialogue line
                # Format: Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
                parts = line.split(",", 9)
                if len(parts) >= 10:
                    start_time_str = parts[1].strip()
                    end_time_str = parts[2].strip()
                    text = parts[9].strip()

                    start_time = parse_ass_time(start_time_str)
                    end_time = parse_ass_time(end_time_str)

                    # Remove ASS formatting codes
                    text = re.sub(r"\\N", " ", text)  # Newline
                    text = re.sub(r"{[^}]*}", "", text)  # Formatting tags
                    text = text.replace("\\,", ",")  # Escaped comma

                    if text:
                        dialogue_entries.append(
                            {
                                "start": start_time,
                                "end": end_time,
                                "duration": end_time - start_time,
                                "text": text,
                            }
                        )

        logging.info(
            f"📝 Parsed {len(dialogue_entries)} dialogue entries from subtitle file"
        )
        return dialogue_entries

    except Exception as e:
        logging.error(f"❌ Error parsing ASS file: {e}")
        return []


def group_dialogues_into_sentences(
    dialogues: List[Dict[str, Any]], max_duration: float = 10.0
) -> List[Dict[str, Any]]:
    """
    Group word-level dialogue entries into sentence-level segments.

    Args:
        dialogues: List of dialogue entries from parse_ass_subtitle_file
        max_duration: Maximum duration for a single segment (seconds)

    Returns:
        List of sentence-level segments with start, end, duration, and text
    """
    if not dialogues:
        return []

    sentences = []
    current_sentence = {
        "start": dialogues[0]["start"],
        "end": dialogues[0]["end"],
        "text": dialogues[0]["text"],
    }
    current_words = [dialogues[0]["text"]]

    for i in range(1, len(dialogues)):
        dialogue = dialogues[i]

        # Check if we should start a new sentence
        previous_end = dialogues[i - 1]["end"]
        pause = dialogue["start"] - previous_end
        current_duration = dialogue["end"] - current_sentence["start"]

        should_split = (
            # Sentence-ending punctuation in previous text
            any(
                dialogues[i - 1]["text"].rstrip().endswith(p)
                for p in [".", "!", "?", ":", ";"]
            )
            or
            # Max duration reached
            current_duration >= max_duration
            or
            # Significant pause (> 0.3 seconds)
            pause > 0.3
        )

        if should_split:
            # Save current sentence
            current_sentence["end"] = previous_end
            current_sentence["duration"] = (
                current_sentence["end"] - current_sentence["start"]
            )
            current_sentence["text"] = " ".join(current_words)
            sentences.append(current_sentence)

            # Start new sentence
            current_sentence = {
                "start": dialogue["start"],
                "end": dialogue["end"],
                "text": dialogue["text"],
            }
            current_words = [dialogue["text"]]
        else:
            # Continue current sentence
            current_sentence["end"] = dialogue["end"]
            current_words.append(dialogue["text"])

    # Add last sentence
    if current_words:
        current_sentence["duration"] = (
            current_sentence["end"] - current_sentence["start"]
        )
        current_sentence["text"] = " ".join(current_words)
        sentences.append(current_sentence)

    logging.info(f"📋 Grouped {len(dialogues)} words into {len(sentences)} sentences")
    return sentences


def get_sentence_timings_from_subtitle(
    subtitle_path: str,
) -> List[Tuple[float, float, str]]:
    """
    Extract sentence-level timings from subtitle file.

    Args:
        subtitle_path: Path to .ass subtitle file

    Returns:
        List of tuples: (start_time, duration, text)
    """
    dialogues = parse_ass_subtitle_file(subtitle_path)
    sentences = group_dialogues_into_sentences(dialogues, max_duration=10.0)

    return [(s["start"], s["duration"], s["text"]) for s in sentences]


if __name__ == "__main__":
    # Test the subtitle service
    import sys

    if len(sys.argv) > 1:
        subtitle_path = sys.argv[1]
        timings = get_sentence_timings_from_subtitle(subtitle_path)
        print(f"\n📝 Found {len(timings)} sentence segments:\n")
        for i, (start, duration, text) in enumerate(timings, 1):
            print(
                f"Segment {i}: {start:.2f}s - {start+duration:.2f}s ({duration:.2f}s)"
            )
            print(f"  Text: {text[:80]}...")
            print()
