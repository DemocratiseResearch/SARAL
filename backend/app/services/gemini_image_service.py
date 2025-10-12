"""
Gemini Image Generation Service
Uses Gemini 2.5 Flash for high-quality image generation
"""

import os
import logging
import tempfile
from io import BytesIO
from PIL import Image
from typing import Optional

logging.basicConfig(level=logging.INFO)


def generate_image_with_gemini(segment, image_index: Optional[int] = None) -> str:
    """
    Generate an infographic-style image using Gemini 2.5 Flash.

    Args:
        segment: ImageSegment object with image_prompt and narration
        image_index: Optional index for logging

    Returns:
        Path to the generated image file
    """
    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError:
        raise Exception(
            "google-genai package not installed. Run: pip install google-genai"
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logging.error("❌ GEMINI_API_KEY not found in environment variables")
        raise Exception("GEMINI_API_KEY is required for Gemini image generation")

    try:
        client = genai.Client(api_key=api_key)

        # Combine image prompt with context from narration
        context_text = f"{segment.image_prompt}. Context: {segment.narration[:150]}"

        if image_index is not None:
            logging.info(f"🎨 Generating image {image_index} with Gemini")
        logging.info(f"   Prompt: {context_text[:100]}...")

        # Enhanced prompt for educational whiteboard-style visuals
        full_prompt = (
            f"Create a professional educational infographic illustration. "
            f"Style: Clean, minimalist, hand-drawn whiteboard aesthetic with simple black line art on white background. "
            f"Content: {context_text}. "
            f"Requirements: High contrast, clear visual explanation, simple shapes, easy to understand, "
            f"suitable for educational video animation. Professional diagram with labels if applicable."
        )

        # Generate image with Gemini
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[full_prompt],
            config=genai_types.GenerateContentConfig(
                response_modalities=["Image"]  # Only return images
            ),
        )

        # Extract image from response
        if not response.candidates or len(response.candidates) == 0:
            raise Exception("No candidates in response")

        image_parts = [
            part.inline_data.data
            for part in response.candidates[0].content.parts  # type: ignore
            if part.inline_data is not None
        ]

        if not image_parts:
            raise Exception("No image generated in response")

        # Save image to temporary file
        image = Image.open(BytesIO(image_parts[0]))  # type: ignore

        # Resize to standard video dimensions if needed
        target_size = (856, 480)  # 16:9 aspect ratio at reasonable resolution
        if image.size != target_size:
            logging.info(f"   Resizing from {image.size} to {target_size}")
            image = image.resize(target_size, Image.Resampling.LANCZOS)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
            image.save(temp_file.name)
            image_path = temp_file.name

        logging.info(f"   ✓ Image saved to {image_path}")
        return image_path

    except Exception as e:
        logging.exception(f"Error generating image with Gemini: {e}")
        raise Exception(f"Gemini image generation failed: {e}")


def test_gemini_image_generation():
    """Test function to verify Gemini image generation works"""
    from dataclasses import dataclass

    @dataclass
    class TestSegment:
        start_time: float
        duration: float
        image_prompt: str
        narration: str

    test_segment = TestSegment(
        start_time=0.0,
        duration=5.0,
        image_prompt="WiFi router with radio waves, smartphone receiving signals",
        narration="WiFi-based localization uses signal strength from multiple access points.",
    )

    try:
        image_path = generate_image_with_gemini(test_segment, image_index=1)
        print(f"✅ Test successful! Image saved to: {image_path}")
        return image_path
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return None


if __name__ == "__main__":
    test_gemini_image_generation()
