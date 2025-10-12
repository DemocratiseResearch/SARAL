"""
Whiteboard Animation Service
Creates hand-drawing style animations with synchronized audio and subtitles
"""

import os
import subprocess
import logging
import tempfile
import cv2
import numpy as np
import platform
from typing import Optional, Tuple, List

logging.basicConfig(level=logging.INFO)

# Paths to hand assets (will be created in images directory)
HAND_IMAGE_PATH = os.path.join(os.path.dirname(__file__), "../images/drawing-hand.png")
HAND_MASK_PATH = os.path.join(os.path.dirname(__file__), "../images/hand-mask.png")


def sanitize_path_for_ffmpeg(path: str) -> str:
    """Sanitize file paths for ffmpeg filter usage (for subtitles)"""
    if platform.system() == "Windows":
        return path.replace("\\", "\\\\").replace(":", "\\:")
    else:
        return (
            path.replace("'", "'\\''")
            .replace(":", "\\:")
            .replace(",", "\\,")
            .replace("[", "\\[")
            .replace("]", "\\]")
        )


def euc_dist(arr1, point):
    """Calculate Euclidean distance from array of points to a single point"""
    square_sub = (arr1 - point) ** 2
    return np.sqrt(np.sum(square_sub, axis=1))


def get_extreme_coordinates(mask):
    """Get bounding box coordinates from a mask"""
    indices = np.where(mask == 255)
    if len(indices[0]) == 0 or len(indices[1]) == 0:
        return (0, 0), (mask.shape[1], mask.shape[0])
    x = indices[1]
    y = indices[0]
    topleft = (np.min(x), np.min(y))
    bottomright = (np.max(x), np.max(y))
    return topleft, bottomright


def preprocess_hand_image(hand_path: str, hand_mask_path: str) -> Tuple:
    """Load and preprocess hand image with its mask"""
    if not os.path.exists(hand_path) or not os.path.exists(hand_mask_path):
        logging.warning(f"Hand assets not found at {hand_path} or {hand_mask_path}")
        return None, None, None, None, None

    hand = cv2.imread(hand_path)
    hand_mask = cv2.imread(hand_mask_path, cv2.IMREAD_GRAYSCALE)

    if hand is None or hand_mask is None:
        logging.warning(
            f"Could not load hand assets from {hand_path} or {hand_mask_path}"
        )
        return None, None, None, None, None

    top_left, bottom_right = get_extreme_coordinates(hand_mask)
    hand = hand[top_left[1] : bottom_right[1], top_left[0] : bottom_right[0]]
    hand_mask = hand_mask[top_left[1] : bottom_right[1], top_left[0] : bottom_right[0]]
    hand_mask_inv = 255 - hand_mask

    # Standardizing the hand masks
    hand_mask = hand_mask / 255
    hand_mask_inv = hand_mask_inv / 255

    # Making the hand background black
    hand_bg_ind = np.where(hand_mask == 0)
    hand[hand_bg_ind] = [0, 0, 0]

    hand_ht, hand_wd = hand.shape[0], hand.shape[1]

    return hand, hand_mask, hand_mask_inv, hand_ht, hand_wd


def draw_hand_on_img(
    drawing,
    hand,
    drawing_coord_x: int,
    drawing_coord_y: int,
    hand_mask_inv,
    hand_ht: int,
    hand_wd: int,
    img_ht: int,
    img_wd: int,
):
    """Overlay hand image on the drawing at specified coordinates"""
    remaining_ht = img_ht - drawing_coord_y
    remaining_wd = img_wd - drawing_coord_x

    crop_hand_ht = min(hand_ht, remaining_ht)
    crop_hand_wd = min(hand_wd, remaining_wd)

    if crop_hand_ht <= 0 or crop_hand_wd <= 0:
        return drawing

    hand_cropped = hand[:crop_hand_ht, :crop_hand_wd]
    hand_mask_inv_cropped = hand_mask_inv[:crop_hand_ht, :crop_hand_wd]

    # Apply hand mask to clear the area
    for c in range(3):
        drawing[
            drawing_coord_y : drawing_coord_y + crop_hand_ht,
            drawing_coord_x : drawing_coord_x + crop_hand_wd,
            c,
        ] = (
            drawing[
                drawing_coord_y : drawing_coord_y + crop_hand_ht,
                drawing_coord_x : drawing_coord_x + crop_hand_wd,
                c,
            ]
            * hand_mask_inv_cropped
        )

    # Add the hand
    drawing[
        drawing_coord_y : drawing_coord_y + crop_hand_ht,
        drawing_coord_x : drawing_coord_x + crop_hand_wd,
    ] = (
        drawing[
            drawing_coord_y : drawing_coord_y + crop_hand_ht,
            drawing_coord_x : drawing_coord_x + crop_hand_wd,
        ]
        + hand_cropped
    )

    return drawing


def draw_grid_based_animation(
    img,
    img_thresh,
    hand,
    hand_mask_inv,
    hand_ht: int,
    hand_wd: int,
    video_writer,
    resize_ht: int,
    resize_wd: int,
    split_len: int,
    skip_rate: int,
):
    """
    Draw image using grid-based approach from storyboard-ai
    This creates smooth hand movements across the image
    """
    drawn_frame = np.zeros(img.shape, np.uint8) + np.array([255, 255, 255], np.uint8)

    n_cuts_vertical = resize_ht // split_len
    n_cuts_horizontal = resize_wd // split_len

    # Ensure we have at least 1 cut
    if n_cuts_vertical == 0:
        n_cuts_vertical = 1
    if n_cuts_horizontal == 0:
        n_cuts_horizontal = 1

    # Find grids where there is at least one black pixel
    black_pixel_threshold = 10
    cut_black_indices = []

    for v_idx in range(n_cuts_vertical):
        for h_idx in range(n_cuts_horizontal):
            range_v_start = v_idx * split_len
            range_v_end = min(range_v_start + split_len, resize_ht)
            range_h_start = h_idx * split_len
            range_h_end = min(range_h_start + split_len, resize_wd)

            # Check if this grid has black pixels
            grid_section = img_thresh[
                range_v_start:range_v_end, range_h_start:range_h_end
            ]
            if np.any(grid_section < black_pixel_threshold):
                cut_black_indices.append([v_idx, h_idx])

    cut_black_indices = np.array(cut_black_indices)

    if len(cut_black_indices) == 0:
        logging.warning("⚠️ No black pixels found in image, showing entire image")
        for i in range(24):  # Show final image for 1 second
            video_writer.write(img)
        return img

    selected_ind = 0
    counter = 0

    while len(cut_black_indices) > 1:
        selected_ind_val = cut_black_indices[selected_ind].copy()
        range_v_start = selected_ind_val[0] * split_len
        range_v_end = min(range_v_start + split_len, resize_ht)
        range_h_start = selected_ind_val[1] * split_len
        range_h_end = min(range_h_start + split_len, resize_wd)

        # Get the actual dimensions of the current grid
        actual_v_len = range_v_end - range_v_start
        actual_h_len = range_h_end - range_h_start

        # Draw this grid section
        grid_section = img_thresh[range_v_start:range_v_end, range_h_start:range_h_end]
        temp_drawing = np.zeros((actual_v_len, actual_h_len, 3), dtype=np.uint8)
        temp_drawing[:, :, 0] = grid_section
        temp_drawing[:, :, 1] = grid_section
        temp_drawing[:, :, 2] = grid_section

        drawn_frame[range_v_start:range_v_end, range_h_start:range_h_end] = temp_drawing

        hand_coord_x = range_h_start + int(actual_h_len / 2)
        hand_coord_y = range_v_start + int(actual_v_len / 2)

        if hand is not None:
            drawn_frame_with_hand = draw_hand_on_img(
                drawn_frame.copy(),
                hand.copy(),
                hand_coord_x,
                hand_coord_y,
                hand_mask_inv.copy(),
                hand_ht,
                hand_wd,
                resize_ht,
                resize_wd,
            )
        else:
            drawn_frame_with_hand = drawn_frame.copy()

        # Delete the selected ind from the array
        cut_black_indices = np.delete(cut_black_indices, selected_ind, axis=0)

        # Select the next new index based on nearest neighbor
        if len(cut_black_indices) > 0:
            euc_arr = euc_dist(cut_black_indices, selected_ind_val)
            selected_ind = np.argmin(euc_arr)

        counter += 1
        if counter % skip_rate == 0:
            video_writer.write(drawn_frame_with_hand)

    # Final frame with complete image
    drawn_frame[:, :, :] = img

    return drawn_frame


def generate_image(
    segment, image_index: Optional[int] = None, image_model: str = "pollinations"
) -> str:
    """
    Generate a single infographic-style image from segment details.
    Supports Gemini, Pollinations AI (free), and Stable Diffusion.

    Args:
        segment: ImageSegment object with image_prompt and narration
        image_index: Optional index for logging
        image_model: "pollinations" (default, free), "gemini", or "sd"

    Returns:
        Path to generated image file
    """
    # Use Pollinations AI (free, no API key)
    if image_model == "pollinations":
        from .pollinations_service import generate_image_with_pollinations

        return generate_image_with_pollinations(segment, image_index)

    # Use Gemini
    elif image_model == "gemini":
        from .gemini_image_service import generate_image_with_gemini

        return generate_image_with_gemini(segment, image_index)

    # Use Stable Diffusion
    elif image_model == "sd":
        try:
            import torch
            from diffusers import StableDiffusionPipeline  # type: ignore

            logging.info("🎨 Loading Stable Diffusion 1.5 model...")
            pipe = StableDiffusionPipeline.from_pretrained(
                "stable-diffusion-v1-5/stable-diffusion-v1-5",
                torch_dtype=torch.float16,
                variant="fp16",
            )
            pipe.to("cuda")

            # Combine image prompt with context from narration
            context_text = f"{segment.image_prompt}. Context: {segment.narration[:150]}"
            if image_index is not None:
                logging.info(f"🎨 Generating image {image_index} with Stable Diffusion")
            logging.info(f"   Full prompt: {context_text[:100]}...")

            # Enhanced prompt for educational infographic-style visuals
            infographic_prompt = (
                f"professional infographic illustration, clean educational diagram, "
                f"minimalist whiteboard drawing style, simple black line art on white background, "
                f"concept: {context_text}, "
                f"clear visual explanation, hand-drawn sketch aesthetic, "
                f"high contrast, simple shapes, easy to understand"
            )

            image = pipe(
                prompt=infographic_prompt,
                num_inference_steps=20,
                guidance_scale=7.5,
                height=480,
                width=856,
            ).images[
                0
            ]  # type: ignore

            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".png"
            ) as temp_image_file:
                image.save(temp_image_file.name)
                image_path = temp_image_file.name

            logging.info(f"   ✓ Image saved to {image_path}")

            # Cleanup
            pipe.to("cpu")
            torch.cuda.empty_cache()

            return image_path

        except Exception as e:
            logging.error(f"❌ Stable Diffusion failed: {e}")
            raise

    else:
        raise ValueError(f"Unknown image model: {image_model}")


def create_whiteboard_animation(
    video_script,
    audio_file: str,
    subtitle_file: Optional[str] = None,
    image_model: str = "pollinations",
) -> str:
    """
    Creates whiteboard animation using a pre-generated VideoScript.

    Args:
        video_script: VideoScript object with segments already planned
        audio_file: Path to audio file
        subtitle_file: Path to ASS subtitle file (optional)
        image_model: Image generation model: "pollinations" (default), "gemini", or "sd"

    Returns:
        Path to final video file
    """
    temp_files: List[str] = []

    try:
        model_names = {
            "gemini": "Gemini 2.0 Flash",
            "pollinations": "Pollinations AI (Free)",
            "sd": "Stable Diffusion 1.5",
        }
        image_model_name = model_names.get(image_model, "Unknown")

        logging.info(f"🎬 Creating whiteboard animation: {video_script.title}")
        logging.info(
            f"📊 Segments: {len(video_script.segments)}, Duration: {video_script.total_duration:.1f}s"
        )
        logging.info(f"🎨 Image generation: {image_model_name}")

        # Get audio duration to verify sync
        audio_duration_cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            audio_file,
        ]
        audio_duration = float(
            subprocess.check_output(audio_duration_cmd).decode("utf-8").strip()
        )
        logging.info(f"🔊 Audio duration: {audio_duration:.1f}s")

        # Generate all images for each segment
        segment_images = []
        for i, segment in enumerate(video_script.segments):
            try:
                image_path = generate_image(
                    segment, image_index=i + 1, image_model=image_model
                )
                temp_files.append(image_path)
                segment_images.append(image_path)
            except Exception as e:
                error_msg = str(e)
                # Check for Pollinations 502 error
                if "POLLINATIONS_DOWN" in error_msg or "502" in error_msg:
                    logging.error("❌ Pollinations AI service is down!")
                    raise Exception(
                        "⚠️ Pollinations AI is currently unavailable (502 Bad Gateway).\n\n"
                        "Please try one of these alternatives:\n"
                        "1. Add your GEMINI_API_KEY and select 'Gemini Image'\n"
                        "2. Select 'Stable Diffusion 1.5' (requires GPU)\n\n"
                        "Get free Gemini API key: https://aistudio.google.com/app/apikey"
                    )
                else:
                    raise

        # Load and preprocess hand image
        hand, hand_mask, hand_mask_inv, hand_ht, hand_wd = preprocess_hand_image(
            HAND_IMAGE_PATH, HAND_MASK_PATH
        )

        # Create video writer
        resize_ht, resize_wd = 480, 856
        fps = 24
        output_video_path = tempfile.NamedTemporaryFile(
            delete=False, suffix=".mp4"
        ).name
        temp_files.append(output_video_path)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")  # type: ignore
        video_writer = cv2.VideoWriter(
            output_video_path,
            fourcc,
            fps,
            (resize_wd, resize_ht),
        )

        # Drawing parameters
        split_len = 14  # Grid size for drawing
        skip_rate = 10  # Higher = faster drawing

        # Time allocation (40-60 rule)
        drawing_time_ratio = 0.40  # 40% for drawing animation
        hold_time_ratio = 0.60  # 60% for holding

        # Process each segment
        logging.info("✏️ Creating whiteboard animation synced to audio...")
        drawn_frame = None

        for i, (segment, image_path) in enumerate(
            zip(video_script.segments, segment_images)
        ):
            logging.info(f"  🎬 Scene {i+1}/{len(video_script.segments)}")

            # Load and preprocess image
            img = cv2.imread(image_path)
            if img is None:
                logging.error(f"❌ Could not load image: {image_path}")
                continue

            img = cv2.resize(img, (resize_wd, resize_ht))
            img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # Enhanced thresholding
            img_thresh = cv2.adaptiveThreshold(
                img_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 10
            )

            # Calculate time allocation
            drawing_time = segment.duration * drawing_time_ratio
            hold_time = segment.duration * hold_time_ratio

            drawing_frames = int(drawing_time * fps)
            hold_frames = int(hold_time * fps)

            frames_before = video_writer.get(cv2.CAP_PROP_FRAME_COUNT)

            # Draw this segment
            drawn_frame = draw_grid_based_animation(
                img,
                img_thresh,
                hand,
                hand_mask_inv,
                hand_ht,
                hand_wd,
                video_writer,
                resize_ht,
                resize_wd,
                split_len,
                skip_rate,
            )

            # Adjust hold time to match exact audio segment duration
            frames_after = video_writer.get(cv2.CAP_PROP_FRAME_COUNT)
            frames_written = int(frames_after - frames_before)

            total_target_frames = int(segment.duration * fps)
            adjusted_hold_frames = max(0, total_target_frames - frames_written)

            # Hold the final frame
            for _ in range(adjusted_hold_frames):
                video_writer.write(drawn_frame)

            logging.info(f"  ✓ Scene {i+1} complete")

        # Final sync check
        video_duration_so_far = video_writer.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        duration_diff = audio_duration - video_duration_so_far

        # Add padding if needed
        remaining_frames = int(duration_diff * fps)
        if remaining_frames > 0 and drawn_frame is not None:
            for _ in range(remaining_frames):
                video_writer.write(drawn_frame)

        video_writer.release()
        logging.info(f"✅ Animation video created: {output_video_path}")

        # Merge video with audio and subtitles
        final_output = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name

        merge_cmd = ["ffmpeg", "-y", "-i", output_video_path, "-i", audio_file]

        filter_complex = []

        # Add subtitle if provided
        if subtitle_file and os.path.exists(subtitle_file):
            sanitized_path = sanitize_path_for_ffmpeg(os.path.abspath(subtitle_file))
            filter_complex.append(f"ass='{sanitized_path}'")
            logging.info(f"📝 Adding subtitles: {subtitle_file}")

        if filter_complex:
            merge_cmd.extend(["-vf", ",".join(filter_complex)])

        merge_cmd.extend(
            [
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-pix_fmt",
                "yuv420p",
                "-shortest",
                final_output,
            ]
        )

        logging.info("🔗 Merging video with audio...")
        subprocess.run(merge_cmd, check=True, capture_output=True, text=True)
        logging.info(f"🎉 Final video created: {final_output}")

        return final_output

    except subprocess.CalledProcessError as e:
        logging.error(f"❌ FFmpeg command failed: {e.cmd}")
        logging.error(f"Stderr: {e.stderr}")
        raise
    except Exception as e:
        logging.error(f"❌ Error in whiteboard animation: {e}", exc_info=True)
        raise
    finally:
        # Cleanup temporary files
        logging.info(f"🧹 Cleaning up {len(temp_files)} temporary files")
        for f_path in temp_files:
            if f_path and os.path.exists(f_path) and f_path != final_output:
                try:
                    os.remove(f_path)
                except Exception as e:
                    logging.warning(f"Could not remove {f_path}: {e}")
