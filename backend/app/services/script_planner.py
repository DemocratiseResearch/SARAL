"""
Video Script Planner
Plans visual scenes with timing for whiteboard animations
"""

import logging
import os
import json
from dataclasses import dataclass
from typing import List, Optional

logging.basicConfig(level=logging.INFO)


@dataclass
class ImageSegment:
    """Represents a single visual segment with timing"""

    start_time: float
    duration: float
    image_prompt: str
    narration: str


@dataclass
class VideoScript:
    """Complete video script with multiple segments"""

    title: str
    segments: List[ImageSegment]
    total_duration: float


def parse_subtitle_timing(subtitle_file: str) -> List[tuple]:
    """
    Parse ASS subtitle file to extract actual word timing

    Returns:
        List of (start_time, end_time, text) tuples
    """
    timings = []

    try:
        with open(subtitle_file, "r", encoding="utf-8") as f:
            lines = f.readlines()

        in_events = False
        for line in lines:
            if line.strip() == "[Events]":
                in_events = True
                continue

            if in_events and line.startswith("Dialogue:"):
                parts = line.split(",", 9)
                if len(parts) >= 10:
                    # Parse time format (0:00:00.00)
                    start_str = parts[1].strip()
                    end_str = parts[2].strip()
                    text = parts[9].strip()

                    # Convert to seconds
                    start_time = time_str_to_seconds(start_str)
                    end_time = time_str_to_seconds(end_str)

                    timings.append((start_time, end_time, text))

        logging.info(f"📝 Parsed {len(timings)} subtitle segments")
        return timings

    except Exception as e:
        logging.warning(f"⚠️ Could not parse subtitle file: {e}")
        return []


def time_str_to_seconds(time_str: str) -> float:
    """Convert ASS time format (0:00:00.00) to seconds"""
    try:
        parts = time_str.split(":")
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    except:
        return 0.0


def create_video_script(
    narration: str,
    subtitle_file: Optional[str] = None,
    target_duration: float = 60.0,
    scenes_count: Optional[int] = None,
) -> VideoScript:
    """
    Create a video script with visual scene breakdown

    Args:
        narration: Full narration text
        subtitle_file: Optional ASS subtitle file with actual timing
        target_duration: Target video duration in seconds
        scenes_count: Optional fixed number of scenes (auto-calculated if None)

    Returns:
        VideoScript object with timed segments
    """
    try:
        # Use Gemini to generate scene breakdown
        from google import genai
        from google.genai import types as genai_types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise Exception("GEMINI_API_KEY required for script planning")

        client = genai.Client(api_key=api_key)

        # Parse subtitle timing if available
        subtitle_timings = []
        if subtitle_file and os.path.exists(subtitle_file):
            subtitle_timings = parse_subtitle_timing(subtitle_file)

        # Calculate optimal number of scenes
        if scenes_count is None:
            # Aim for 8-10 second scenes for better pacing
            # For ~100 second videos, this gives us 10-12 scenes
            scenes_count = max(3, min(15, int(target_duration / 9)))

        logging.info(
            f"🎬 Planning {scenes_count} visual scenes for {target_duration:.1f}s video"
        )

        # Create prompt for Gemini
        prompt = f"""You are a video script planner for educational whiteboard animations.

Given this narration text, break it down into {scenes_count} visual scenes.
Each scene should have a clear visual concept that can be illustrated.

Narration:
{narration}

Target duration: {target_duration:.1f} seconds
Number of scenes: {scenes_count}

IMPORTANT REQUIREMENTS:
- Each scene should be 8-10 seconds long for optimal pacing
- Total script length should be around 100 seconds (~250 words)
- Keep each scene's narration concise (20-25 words per scene)
- Focus on ONE key concept per scene

For each scene, provide:
1. A concise image_prompt (50-100 chars) describing what to visualize
2. The narration_text that corresponds to that visual (20-25 words)

Return ONLY a valid JSON array with this structure:
[
  {{
    "image_prompt": "Brief visual description",
    "narration_text": "Concise 20-25 word narration for this scene"
  }},
  ...
]

Make sure scenes flow logically and are evenly paced (8-10 seconds each).
Focus on key concepts that can be visualized clearly."""

        response = client.models.generate_content(
            model="gemini-2.5-flash", contents=[prompt]
        )

        # Extract JSON from response
        response_text = response.text.strip()

        # Clean up potential markdown formatting
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        scenes_data = json.loads(response_text)

        # Calculate timing for each scene
        segments = []

        if subtitle_timings:
            # Use actual subtitle timing for precise sync
            logging.info("⏱️ Using subtitle timing for precise synchronization")

            # Distribute subtitle segments across visual scenes
            subs_per_scene = len(subtitle_timings) // len(scenes_data)

            for i, scene in enumerate(scenes_data):
                start_idx = i * subs_per_scene
                end_idx = (
                    start_idx + subs_per_scene
                    if i < len(scenes_data) - 1
                    else len(subtitle_timings)
                )

                scene_subs = subtitle_timings[start_idx:end_idx]

                if scene_subs:
                    start_time = scene_subs[0][0]
                    end_time = scene_subs[-1][1]
                    duration = end_time - start_time

                    # Combine narration from subtitles
                    scene_narration = " ".join([sub[2] for sub in scene_subs])
                else:
                    # Fallback timing
                    start_time = i * (target_duration / len(scenes_data))
                    duration = target_duration / len(scenes_data)
                    scene_narration = scene.get("narration_text", "")

                segments.append(
                    ImageSegment(
                        start_time=start_time,
                        duration=duration,
                        image_prompt=scene.get("image_prompt", ""),
                        narration=scene_narration,
                    )
                )
        else:
            # Evenly distribute time across scenes
            logging.info("⏱️ Using even time distribution")
            time_per_scene = target_duration / len(scenes_data)

            for i, scene in enumerate(scenes_data):
                segments.append(
                    ImageSegment(
                        start_time=i * time_per_scene,
                        duration=time_per_scene,
                        image_prompt=scene.get("image_prompt", ""),
                        narration=scene.get("narration_text", ""),
                    )
                )

        total_duration = sum(seg.duration for seg in segments)

        video_script = VideoScript(
            title="Educational Video", segments=segments, total_duration=total_duration
        )

        logging.info(
            f"✅ Created script with {len(segments)} scenes, {total_duration:.1f}s total"
        )

        return video_script

    except Exception as e:
        logging.error(f"❌ Error creating video script: {e}", exc_info=True)

        # Fallback: Create simple single-scene script
        logging.warning("⚠️ Using fallback single-scene script")
        return VideoScript(
            title="Educational Video",
            segments=[
                ImageSegment(
                    start_time=0.0,
                    duration=target_duration,
                    image_prompt=narration[:100],
                    narration=narration,
                )
            ],
            total_duration=target_duration,
        )


if __name__ == "__main__":
    # Test script planner
    test_narration = """
    Machine learning is a subset of artificial intelligence that enables computers to learn from data.
    Neural networks are inspired by the human brain and consist of interconnected nodes.
    Deep learning uses multiple layers to progressively extract higher-level features from raw input.
    """

    script = create_video_script(test_narration, target_duration=30.0)

    print(f"\n📝 Generated Script: {script.title}")
    print(f"⏱️ Total Duration: {script.total_duration:.1f}s")
    print(f"🎬 Scenes: {len(script.segments)}\n")

    for i, seg in enumerate(script.segments, 1):
        print(f"Scene {i}:")
        print(f"  Time: {seg.start_time:.1f}s - {seg.start_time + seg.duration:.1f}s")
        print(f"  Visual: {seg.image_prompt}")
        print(f"  Narration: {seg.narration[:80]}...")
        print()
