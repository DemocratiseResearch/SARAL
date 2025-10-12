"""
Pollinations AI Image Generation Service
Completely free image generation with no API key required
"""

import logging
import tempfile
import requests
from urllib.parse import quote
from PIL import Image
from io import BytesIO
from typing import Optional

logging.basicConfig(level=logging.INFO)


def generate_image_with_pollinations(segment, image_index: Optional[int] = None) -> str:
    """
    Generate an infographic-style image using Pollinations AI (completely free).

    Args:
        segment: ImageSegment object with image_prompt and narration
        image_index: Optional index for logging

    Returns:
        Path to the generated image file
    """
    try:
        # Combine image prompt with context from narration
        context_text = f"{segment.image_prompt}. Context: {segment.narration[:150]}"

        if image_index is not None:
            logging.info(
                f"🎨 Generating image {image_index} with Pollinations AI (Free)"
            )
        logging.info(f"   Prompt: {context_text[:100]}...")

        # Enhanced prompt for educational whiteboard-style visuals
        full_prompt = (
            f"Professional educational infographic illustration. "
            f"Clean minimalist hand-drawn whiteboard style with simple black line art on white background. "
            f"Concept: {context_text}. "
            f"High contrast clear visual explanation simple shapes easy to understand "
            f"suitable for educational video animation professional diagram with labels"
        )

        # URL encode the prompt
        encoded_prompt = quote(full_prompt)

        # Pollinations AI endpoint (completely free, no API key needed)
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

        # Add query parameters for better control
        params = {
            "width": 856,
            "height": 480,
            "nologo": "true",  # Remove watermark
            "enhance": "true",  # Better quality
        }

        # Build full URL with parameters
        param_string = "&".join([f"{k}={v}" for k, v in params.items()])
        full_url = f"{url}?{param_string}"

        logging.info(f"   Requesting from Pollinations AI...")

        # Make request with timeout
        response = requests.get(full_url, timeout=60)
        response.raise_for_status()

        # Load and verify image
        image = Image.open(BytesIO(response.content))

        # Ensure correct dimensions
        target_size = (856, 480)
        if image.size != target_size:
            logging.info(f"   Resizing from {image.size} to {target_size}")
            image = image.resize(target_size, Image.Resampling.LANCZOS)

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
            image.save(temp_file.name, format="PNG")
            image_path = temp_file.name

        logging.info(f"   ✓ Image saved to {image_path}")
        return image_path

    except requests.exceptions.Timeout:
        logging.error("⏱️ Pollinations AI request timed out (60s)")
        raise Exception("Pollinations AI request timed out - please try again")

    except requests.exceptions.HTTPError as e:
        # Check for 502 Bad Gateway specifically
        if e.response.status_code == 502:
            logging.error("❌ Pollinations AI service is down (502 Bad Gateway)")
            raise Exception(
                "POLLINATIONS_DOWN: Pollinations AI service is currently unavailable (502 error). "
                "Please switch to Gemini Image or Stable Diffusion from the sidebar."
            )
        else:
            logging.exception(f"HTTP error from Pollinations AI: {e}")
            raise Exception(f"Pollinations AI HTTP error: {e}")

    except requests.exceptions.RequestException as e:
        logging.exception(f"Error fetching from Pollinations AI: {e}")
        raise Exception(f"Pollinations AI request failed: {e}")

    except Exception as e:
        logging.exception(f"Error generating image with Pollinations: {e}")
        raise Exception(f"Pollinations image generation failed: {e}")


def test_pollinations_generation():
    """Test function to verify Pollinations AI works"""
    # Import here to avoid circular imports
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
        image_path = generate_image_with_pollinations(test_segment, image_index=1)
        print(f"✅ Test successful! Image saved to: {image_path}")
        return image_path
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return None


if __name__ == "__main__":
    test_pollinations_generation()
