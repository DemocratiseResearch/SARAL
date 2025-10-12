import os
import re
import subprocess
import logging
from pathlib import Path
from typing import Optional, Tuple
import google.generativeai as genai
from google import genai as genai_client
from google.genai import types as genai_types
from pydantic import BaseModel
from dotenv import load_dotenv
from .manim_fallback import fix_manim_code
from .unified_tts_service import generate_audio_unified

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ManimOutput(BaseModel):
    manim_code: str
    narration: str


SYSTEM_PROMPT = """
You are an expert Manim programmer creating stunning 60-second animated explanations of research papers using Manim Community v0.19.0.

YOUR MANDATORY RULES:
- **STRICT REFERENCE ENFORCEMENT:**
  - You may ONLY use animation methods, argument patterns, and class names that appear in the following reference examples (see below).
  - Do NOT invent new animation names or argument signatures. If you want to animate a bar growing, use Create(Rectangle(...)), not GrowFromBottom.
  - Never use ShowCreation, GrowFromBottom, ShowPassingFlash, ShowIncreasingSubsets, TransformFromAbove, TransformFromBelow, or any method not present in the examples.
  - Never use self.wait(0) or self.wait with zero/negative values. All waits must be > 0.
  - If you are unsure, copy the exact method and argument usage from the examples below.
- **ANIMATION-FIRST:** Use animations to explain, not text. Show transformations, movements, mathematical relationships.
- **MINIMAL TEXT:** Only use text for titles, key terms, and brief labels. Never paragraph text.
- **COLOR SCHEME:** Beige/cream background (#F5F5DC or similar) with BLACK text and diagrams for maximum contrast.
- **DURATION:** Exactly 60 seconds total.
- **NARRATION:** 150-160 words (2.5 words/sec speaking pace).

VISUAL STYLE GUIDELINES:
- Background: Use self.camera.background_color = "#F5F5DC" (beige/cream) at start of construct().
- Text/Diagrams: BLACK color for all text, shapes, arrows, equations.
- Animations: Smooth, flowing transformations showing mathematical relationships.
- If you need to show a bar growing, use Create(Rectangle(...)), not GrowFromBottom.
- If you need to show a line or arrow, use Create(Line(...)) or Create(Arrow(...)), as in the examples.
- If you need to fade out, use FadeOut(...), as in the examples.
- If you need to highlight, use Indicate(...) or Circumscribe(...), as in the examples.
- If you need to wait, use self.wait(seconds) with seconds > 0, as in the examples.
- If you are unsure, copy the exact method and argument usage from the examples below.

BLACKLISTED METHODS (NEVER USE):
- GrowFromBottom
- ShowCreation
- ShowPassingFlash
- ShowIncreasingSubsets
- TransformFromAbove
- TransformFromBelow
- Check (use Checkmark instead)
- Cross (use Cross mobject or X instead)
- Any method not present in the reference examples

BLACKLISTED IMPORTS (DO NOT IMPORT):
- from manim import Check (use Checkmark)
- from manim import Cross (use X or create with Line objects)
- Any import not shown in the reference examples

REFERENCE EXAMPLES:
(see below, from guide.md)
"""

# Detailed Instructions - Focus on ANIMATIONS not text!
base_prompt_instructions = (
    "\n🎨 VISUAL STYLE (CRITICAL):"
    "\n- Set background: self.camera.background_color = '#F5F5DC' (beige/cream)"
    "\n- ALL text/shapes/diagrams: BLACK color (#000000)"
    "\n- High contrast beige + black = excellent readability"
    "\n"
    "\n✨ ANIMATION PHILOSOPHY:"
    "\n- SHOW concepts through movement and transformation"
    "\n- Use animations to explain relationships, not text"
    "\n- Text is for LABELS only (titles, key terms)"
    "\n- Narration explains while animations demonstrate"
    "\n"
    "\n⏱️ TIMING (60 seconds total):"
    "\n- Introduction: 8-10s (title + setup)"
    "\n- Main animations: 40-45s (3-4 visual segments)"
    "\n- Conclusion: 7-10s (summary visual)"
    "\n- Narration: 150-160 words exactly"
    "\n"
    "\n🎬 ANIMATION TECHNIQUES:"
    "\n- Transform() - morph one shape into another"
    "\n- ReplacementTransform() - smooth equation transitions"
    "\n- Indicate() - highlight important elements"
    "\n- Circumscribe() - draw attention to key parts"
    "\n- MoveAlongPath() - dynamic movement"
    "\n- Rotating() - show rotation/revolution"
    "\n- Create/Write with run_time=2-3 for emphasis"
    "\n- FadeIn/FadeOut for scene transitions"
    "\n"
    "\n📐 MATHEMATICAL VISUALIZATIONS:"
    "\n- Use MathTex for equations (in BLACK)"
    "\n- Animate equation transformations"
    "\n- Show graphs with Axes() and plot()"
    "\n- Use arrows to show relationships"
    "\n- Highlight terms with Indicate() or color changes"
    "\n"
    "\n🚫 AVOID:"
    "\n- Paragraph text (use narration!)"
    "\n- Static displays without animation"
    "\n- Too many elements at once (clutter)"
    "\n- External files or images"
    "\n- TransformFromAbove/TransformFromBelow (don't exist)"
    "\n"
    "\n✅ CODE STRUCTURE:"
    "\n```python"
    "\nclass VideoScene(Scene):"
    "\n    def construct(self):"
    "\n        # Set beige background"
    "\n        self.camera.background_color = '#F5F5DC'"
    "\n        "
    "\n        # Introduction (8-10s)"
    "\n        title = Text('Concept Name', color=BLACK)"
    "\n        self.play(Write(title), run_time=2)"
    "\n        self.wait(1)"
    "\n        self.play(FadeOut(title))"
    "\n        "
    "\n        # Main animation segments (40-45s)"
    "\n        # Use transforms, movements, highlights"
    "\n        # Fade out old elements before new ones"
    "\n        "
    "\n        # Conclusion (7-10s)"
    "\n        # Final visual summary"
    "\n```"
    "\n"
    "\n💬 NARRATION GUIDELINES:"
    "\n- 150-160 words total"
    "\n- Active voice, present tense"
    "\n- Explain what animations show"
    "\n- Include transitions: 'Notice how...', 'Watch as...'"
    "\n- End with strong conclusion"
)

# Base instructions emphasizing REFERENCE EXAMPLES
BASE_MANIM_INSTRUCTIONS = """
🎯 GOLDEN RULE: Follow the reference examples EXACTLY - they are tested and proven to work!

VISUAL STYLE (MANDATORY):
- Background: self.camera.background_color = '#F5F5DC' (beige/cream) 
- Text/Diagrams: BLACK color for everything
- Contrast: High contrast beige background + black foreground

ANIMATION PHILOSOPHY:
- SHOW concepts through motion, not text walls
- Use Transform() to show relationships
- Animate equations with ReplacementTransform()
- Highlight with Indicate() and Circumscribe()
- Text is for LABELS only, narration explains

MANIM v0.19.0 REQUIREMENTS:
- Use np.array([x, y, 0]) for all vectors
- Valid animations: Write(), Create(), FadeIn(), FadeOut(), Transform(), ReplacementTransform()
- Valid objects: Text(), MathTex(), Circle(), Square(), Rectangle(), Arrow(), Line(), Dot()
- NO ImageMobject, NO external files, NO 3D scenes
- NO TransformFromAbove/TransformFromBelow (don't exist!)

TIMING:
- Total: 60 seconds exactly
- Narration: 150-160 words
- Use self.play() with run_time and self.wait() for pacing

STRUCTURE:
```python
class VideoScene(Scene):
    def construct(self):
        self.camera.background_color = '#F5F5DC'  # Beige background
        
        # All text/shapes in BLACK
        title = Text('Title', color=BLACK)
        self.play(Write(title), run_time=2)
        self.wait(1)
        self.play(FadeOut(title))
        
        # Main animations (focus on MOTION not text)
        # ...
```

REFERENCE EXAMPLES ARE YOUR GUIDE - Use their patterns and techniques!
"""


class ManimService:
    """Service for generating Manim animations from research papers"""

    def __init__(self, gemini_api_key: str, sarvam_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key
        self.sarvam_api_key = (
            sarvam_api_key  # No longer used but kept for compatibility
        )
        genai.configure(api_key=gemini_api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")

        # Initialize new genai client for structured output
        self.genai_client = genai_client.Client(api_key=gemini_api_key)

        # Ensure output directories exist with absolute paths
        self.output_dir = Path("temp/manim").resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Manim output directory: {self.output_dir}")

    def generate_manim_animation(
        self, paper_id: str, scripts_data: dict, metadata: dict
    ) -> Tuple[Optional[str], Optional[str]]:
        """Generate a Manim animation from paper content - always 60 seconds"""
        try:
            # Prepare content for Manim generation
            content = self._prepare_content(scripts_data, metadata)

            # Generate Manim code and narration (always 60 seconds)
            manim_code, narration = self._generate_with_gemini(content, 60)

            if manim_code and narration:
                logger.info(
                    f"Successfully generated Manim content for paper {paper_id}"
                )
                return manim_code, narration
            else:
                logger.error(f"Failed to generate Manim content for paper {paper_id}")
                return None, None

        except Exception as e:
            logger.error(f"Error generating Manim animation for paper {paper_id}: {e}")
            return None, None

    def create_video_from_code(
        self,
        paper_id: str,
        manim_code: str,
        narration: Optional[str] = None,
        audio_file: Optional[str] = None,
        max_retries: int = 3,
        tts_provider: str = "kokoro",
        tts_gender: str = "female",
        tts_language: str = "english",
    ) -> Optional[str]:
        """Create video from Manim code with optional TTS generation and audio merging"""
        logger.info(
            f"🎬 CREATE VIDEO - TTS Provider: {tts_provider}, Gender: {tts_gender}, Language: {tts_language}"
        )
        original_context = f"Manim animation for paper {paper_id}"
        current_code = manim_code

        for attempt in range(max_retries + 1):
            try:
                logger.info(
                    f"Attempt {attempt + 1}/{max_retries + 1} to create video for paper {paper_id}"
                )

                # Skip if current_code is None
                if not current_code:
                    logger.error("Current code is None, cannot proceed")
                    continue

                # Create animation file with absolute path
                manim_file = (
                    self.output_dir / f"{paper_id}_animation_attempt_{attempt}.py"
                )
                logger.info(f"Creating Manim file: {manim_file}")

                with open(manim_file, "w", encoding="utf-8") as f:
                    f.write(current_code)

                # Verify file was created
                if not manim_file.exists():
                    logger.error(f"Failed to create Manim file: {manim_file}")
                    continue

                logger.info(f"Manim file created successfully: {manim_file}")

                # Extract scene name
                if current_code:
                    scene_name = self._extract_scene_name(current_code)
                    if not scene_name:
                        logger.error("No valid scene class found in Manim code")
                        if attempt < max_retries and current_code:
                            current_code = self._fix_missing_scene_with_gemini(
                                current_code, original_context
                            )
                            continue
                        return None
                else:
                    logger.error("Cannot extract scene - current_code is None")
                    continue

                logger.info(f"Found scene class: {scene_name}")

                # Render Manim video
                video_path = self._render_manim_video(
                    str(manim_file), scene_name, paper_id, attempt
                )
                if video_path:
                    # Generate TTS audio if narration is provided and no audio file is given
                    final_audio_file = audio_file
                    subtitle_file = None

                    if not audio_file and narration:
                        logger.info(
                            f"Generating TTS audio from narration with {tts_provider}..."
                        )
                        final_audio_file, subtitle_file = self._generate_tts_audio(
                            narration, paper_id, tts_provider, tts_gender, tts_language
                        )

                    # Merge with audio if available
                    if final_audio_file and os.path.exists(final_audio_file):
                        final_video = self._merge_audio_video(
                            video_path, final_audio_file, paper_id, subtitle_file
                        )
                        return final_video
                    else:
                        logger.info(
                            "No audio file available, returning video without audio"
                        )
                        return video_path

            except Exception as e:
                error_message = str(e)
                logger.error(f"Attempt {attempt + 1} failed: {error_message}")

                if attempt < max_retries:
                    logger.info(
                        f"Attempting to fix code using Google Search grounding fallback (attempt {attempt + 1})"
                    )

                    # Use the new grounding-based fallback
                    if current_code:
                        result = fix_manim_code(
                            current_code, error_message, original_context
                        )

                        if result and len(result) == 2:
                            code_result, narration = result
                            if code_result and "manim_code" in code_result:
                                current_code = code_result["manim_code"]
                                logger.info(
                                    "Google Search grounding fallback provided fixed code, retrying..."
                                )
                            else:
                                logger.error(
                                    "Google Search grounding fallback failed - no valid code"
                                )
                                return None
                        else:
                            logger.error("Google Search grounding fallback failed")
                            return None
                    else:
                        logger.error("Cannot fix code - current_code is None")
                        return None
                else:
                    logger.error(f"All {max_retries + 1} attempts failed")
                    return None

        return None

    def _fix_missing_scene_with_gemini(
        self, code: str, original_context: str
    ) -> Optional[str]:
        """Fix missing scene class using Gemini fallback"""
        # Use the grounding-based fallback for scene fixes too
        result = fix_manim_code(code, "Missing Scene class", original_context)

        if result and len(result) == 2:
            code_result, narration = result
            if code_result and "manim_code" in code_result:
                return code_result["manim_code"]

        return None

    def _prepare_content(self, scripts_data: dict, metadata: dict) -> str:
        """Prepare content for Manim generation"""
        title = metadata.get("title", "Research Paper")
        authors = metadata.get("authors", "Authors")

        sections = scripts_data.get("sections", {})
        title_intro = scripts_data.get("title_intro_script", "")

        content = f"""
        Research Paper: {title}
        Authors: {authors}
        
        Title Introduction: {title_intro}
        
        Sections:
        """

        for section_name, section_content in sections.items():
            if isinstance(section_content, dict):
                script = section_content.get("script", "")
            else:
                script = str(section_content)
            content += f"\n{section_name}: {script}\n"

        return content

    def _generate_with_gemini(
        self, content: str, duration: int = 60
    ) -> Tuple[Optional[str], Optional[str]]:
        """Generate Manim code and narration using Gemini with structured output - always 60 seconds"""
        try:
            # Load Manim examples if available
            manim_examples = self._load_manim_examples()

            contents = []

            if manim_examples:
                examples_prompt = (
                    "🌟 REFERENCE EXAMPLES - YOUR GOLD STANDARD 🌟\n\n"
                    "These examples demonstrate EXACTLY how to create beautiful Manim animations.\n"
                    "Study them carefully and use their patterns:\n"
                    "- Animation techniques (Transform, Indicate, etc.)\n"
                    "- Timing and pacing with self.play() and self.wait()\n"
                    "- Visual organization and layout\n"
                    "- How to show concepts through MOTION not text\n\n"
                    "USE THESE EXTENSIVELY AS YOUR TEMPLATE!\n\n"
                    + manim_examples
                    + "\n\n"
                    + "Remember: These examples WORK. Follow their patterns closely!"
                )
                contents.append(examples_prompt)
                logger.info("Added Manim examples as gold standard reference")
            else:
                logger.warning("No Manim examples were loaded")

            # Create the main prompt for paper content
            user_prompt_text = f"""Create a stunning 60-second Manim animation explaining this research paper.

🎨 VISUAL REQUIREMENTS:
- Background: Beige/cream (#F5F5DC)
- All text/diagrams: BLACK for contrast
- Focus on ANIMATIONS that show concepts, not text paragraphs

📄 PAPER CONTENT:
{content}

🎬 YOUR MISSION:
Create animations that DEMONSTRATE the concepts through:
- Transformations showing relationships
- Movements illustrating processes  
- Mathematical visualizations
- Highlights and emphasis on key points

⏱️ STRUCTURE (60 seconds):
- Intro: 8-10s (title + hook)
- Main: 40-45s (3-4 animated segments)
- Outro: 7-10s (summary visual)

💬 NARRATION: 150-160 words explaining what animations show

🌟 FOLLOW THE REFERENCE EXAMPLES - they show the perfect style!

{BASE_MANIM_INSTRUCTIONS}

{base_prompt_instructions}"""

            contents.append(user_prompt_text)

            logger.info("Sending request to Gemini API for structured output...")

            generation_config = genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ManimOutput,
                system_instruction=SYSTEM_PROMPT,
            )

            response = self.genai_client.models.generate_content(
                model="gemini-2.5-flash", contents=contents, config=generation_config
            )

            if response:
                try:
                    parsed_output = response.parsed
                    if not parsed_output or not isinstance(parsed_output, ManimOutput):
                        logger.error("Failed to parse structured output from Gemini.")
                        return None, None

                    manim_code = parsed_output.manim_code
                    narration = parsed_output.narration
                    logger.info("Successfully parsed structured output from Gemini.")

                    # Ensure imports
                    if "from manim import *" not in manim_code:
                        logger.warning("Adding missing 'from manim import *'.")
                        manim_code = (
                            "from manim import *\nimport numpy as np\n" + manim_code
                        )
                    elif "import numpy as np" not in manim_code:
                        logger.warning("Adding missing 'import numpy as np'.")
                        lines = manim_code.splitlines()
                        for i, line in enumerate(lines):
                            if "from manim import *" in line:
                                lines.insert(i + 1, "import numpy as np")
                                manim_code = "\n".join(lines)
                                break

                    return manim_code, narration

                except (ValueError, AttributeError) as e:
                    logger.warning(f"Could not parse the response. Error: {e}")
                    if (
                        response.prompt_feedback
                        and response.prompt_feedback.block_reason
                    ):
                        logger.error(
                            f"Content generation blocked. Reason: {response.prompt_feedback.block_reason.name}"
                        )
                    return None, None
            else:
                logger.error("No response received from Gemini API")
                return None, None

        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return None, None

    def _load_manim_examples(self) -> str:
        """Load Manim examples from guide.md if available"""
        # TODO , add guide.md
        try:
            guide_path = Path(__file__).parent / "guide.md"
            if guide_path.exists():
                logger.info(f"Loading Manim examples from {guide_path}")
                return guide_path.read_text(encoding="utf-8")
            else:
                logger.warning(f"Manim examples guide not found at {guide_path}")
                return ""
        except Exception as e:
            logger.warning(f"Error loading Manim examples: {e}")
            return ""

    def _extract_scene_name(self, manim_code: str) -> Optional[str]:
        """Extract scene class name from Manim code"""
        match = re.search(r"class\s+(\w+)\s*\(\s*(?:ThreeD)?Scene\s*\)", manim_code)
        return match.group(1) if match else None

    def _render_manim_video(
        self, manim_file: str, scene_name: str, paper_id: str, attempt: int
    ) -> Optional[str]:
        """Render Manim video"""
        original_cwd = os.getcwd()
        try:
            # Ensure the file exists
            if not os.path.exists(manim_file):
                logger.error(f"Manim file does not exist: {manim_file}")
                return None

            manim_dir = Path(manim_file).parent
            manim_filename = Path(manim_file).name

            os.chdir(manim_dir)
            logger.info(f"Changed to directory: {manim_dir}")

            # Create media directory
            media_dir = manim_dir / "media"
            media_dir.mkdir(exist_ok=True)

            # Run manim command with lower quality for faster rendering
            cmd = [
                "manim",
                "-ql",
                manim_filename,
                scene_name,
            ]  # -ql for low quality, faster
            logger.info(f"Running Manim command: {' '.join(cmd)}")
            logger.info(f"Working directory: {os.getcwd()}")

            result = subprocess.run(
                cmd, check=True, capture_output=True, text=True, timeout=300
            )

            logger.info(f"Manim stdout: {result.stdout}")
            if result.stderr:
                logger.warning(f"Manim stderr: {result.stderr}")
                # If there are errors in stderr but command succeeded, still try to find video
                if (
                    "Error" in result.stderr
                    or "Exception" in result.stderr
                    or "TypeError" in result.stderr
                ):
                    logger.error(f"Manim completed but with errors: {result.stderr}")
                    raise Exception(f"Manim rendering had errors: {result.stderr}")

            # Find the generated video (low quality paths)
            possible_paths = [
                f"media/videos/{Path(manim_filename).stem}/480p15/{scene_name}.mp4",
                f"media/videos/{Path(manim_filename).stem}/720p30/{scene_name}.mp4",
                f"media/videos/{Path(manim_filename).stem}/1080p60/{scene_name}.mp4",
            ]

            video_path = None
            for possible_path in possible_paths:
                full_path = manim_dir / possible_path
                logger.info(f"Checking for video at: {full_path}")
                if full_path.exists():
                    # Copy to a predictable location
                    output_file = (
                        manim_dir / f"{paper_id}_manim_video_attempt_{attempt}.mp4"
                    )
                    import shutil

                    shutil.copy2(full_path, output_file)
                    video_path = str(output_file)
                    logger.info(f"Found and copied video to: {video_path}")
                    break

            if not video_path:
                logger.error("No video file found after rendering")
                # List contents of media directory for debugging
                media_path = manim_dir / "media"
                if media_path.exists():
                    logger.info(
                        f"Media directory contents: {list(media_path.rglob('*'))}"
                    )

            return video_path

        except subprocess.CalledProcessError as e:
            error_details = e.stderr if e.stderr else str(e)
            logger.error(f"Manim rendering failed: {error_details}")
            raise Exception(f"Manim rendering failed: {error_details}")
        except subprocess.TimeoutExpired:
            logger.error("Manim rendering timed out")
            raise Exception("Manim rendering timed out")
        except Exception as e:
            logger.error(f"Unexpected error during Manim rendering: {e}")
            raise e
        finally:
            # Always restore the original directory
            os.chdir(original_cwd)

    def _generate_tts_audio(
        self,
        narration: str,
        paper_id: str,
        tts_provider: str = "kokoro",
        tts_gender: str = "female",
        tts_language: str = "english",
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Generate TTS audio from narration text using the unified TTS service.
        Returns tuple of (audio_file_path, subtitle_file_path).
        Note: Only Kokoro returns subtitles; other providers return (audio, None).
        """
        try:
            logger.info(
                f"🎤 TTS PROVIDER: {tts_provider}, GENDER: {tts_gender}, LANGUAGE: {tts_language}"
            )

            # Clean the narration text for TTS
            cleaned_text = self._clean_script_for_tts(narration)

            # Create audio directory
            audio_dir = Path("temp/audio") / paper_id
            audio_dir.mkdir(parents=True, exist_ok=True)

            logger.info(
                f"Generating TTS audio using {tts_provider} for paper {paper_id}"
            )
            logger.info(f"Cleaned text length: {len(cleaned_text)} characters")

            # Generate audio with unified TTS service
            audio_filename = str(audio_dir / f"{paper_id}_narration.wav")
            audio_path, subtitle_path = generate_audio_unified(
                text=cleaned_text,
                provider=tts_provider,
                gender=tts_gender,
                language=tts_language,
                output_filename=audio_filename,
            )

            if audio_path:
                logger.info(f"✅ TTS audio saved to: {audio_path}")
                if subtitle_path:
                    logger.info(f"✅ Subtitles saved to: {subtitle_path}")
                else:
                    logger.info(f"⚠️ No subtitles generated (provider: {tts_provider})")
                return audio_path, subtitle_path
            else:
                logger.error(f"Failed to generate TTS audio with {tts_provider}")
                return None, None

        except Exception as e:
            logger.error(f"Error generating TTS audio: {e}", exc_info=True)
            return None, None

    def _split_text_into_chunks(self, text: str, max_length: int = 450) -> list[str]:
        """
        Split text into chunks respecting sentence boundaries.
        NOTE: Kokoro handles long text automatically, but keeping this for backward compatibility.
        """
        if len(text) <= max_length:
            return [text]

        chunks = []
        # Split by sentences first
        sentences = re.split(r"(?<=[.!?])\s+", text)

        current_chunk = ""
        for sentence in sentences:
            # If adding this sentence would exceed the limit
            if len(current_chunk) + len(sentence) + 1 > max_length:
                if current_chunk:  # If we have content, save it
                    chunks.append(current_chunk.strip())
                    current_chunk = sentence + " "
                else:  # If sentence itself is too long, split it by words
                    words = sentence.split()
                    for word in words:
                        if len(current_chunk) + len(word) + 1 > max_length:
                            if current_chunk:
                                chunks.append(current_chunk.strip())
                                current_chunk = word + " "
                            else:
                                # Even single word is too long, just add it
                                chunks.append(word)
                                current_chunk = ""
                        else:
                            current_chunk += word + " "
            else:
                current_chunk += sentence + " "

        # Add any remaining content
        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks

    def _merge_audio_files(self, audio_files: list[str], output_path: str) -> bool:
        """Merge multiple audio files using FFmpeg"""
        try:
            if len(audio_files) == 1:
                # If only one file, just copy it
                import shutil

                shutil.copy2(audio_files[0], output_path)
                return True

            # Create a temporary file list for FFmpeg concat
            concat_file = Path(output_path).parent / "concat_list.txt"

            with open(concat_file, "w") as f:
                for audio_file in audio_files:
                    f.write(f"file '{audio_file}'\n")

            # Use FFmpeg to concatenate audio files
            cmd = [
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
                output_path,
            ]

            logger.info(f"Merging {len(audio_files)} audio files with FFmpeg")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

            # Clean up concat file
            try:
                os.remove(concat_file)
            except Exception:
                pass

            if result.returncode == 0:
                logger.info(f"Successfully merged audio files to: {output_path}")
                return True
            else:
                logger.error(f"FFmpeg audio merge failed: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"Error merging audio files: {e}")
            return False

    def _clean_script_for_tts(self, script_text: str) -> str:
        """Clean script text for TTS synthesis"""
        try:
            # Remove any markdown formatting
            cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", script_text)  # Remove bold
            cleaned = re.sub(r"\*(.*?)\*", r"\1", cleaned)  # Remove italic
            cleaned = re.sub(r"`(.*?)`", r"\1", cleaned)  # Remove code formatting

            # Remove URLs
            cleaned = re.sub(
                r"http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+",
                "",
                cleaned,
            )

            # Remove extra whitespace and newlines
            cleaned = re.sub(r"\s+", " ", cleaned)
            cleaned = cleaned.strip()

            # Ensure text doesn't exceed reasonable length for TTS
            if len(cleaned) > 1000:
                sentences = cleaned.split(". ")
                cleaned = ". ".join(sentences[:10]) + "."  # Keep first 10 sentences

            return cleaned

        except Exception as e:
            logger.error(f"Error cleaning script for TTS: {e}")
            return script_text  # Return original if cleaning fails

    def _merge_audio_video(
        self,
        video_path: str,
        audio_path: str,
        paper_id: str,
        subtitle_path: Optional[str] = None,
    ) -> Optional[str]:
        """Merge audio with video using FFmpeg, optionally with subtitles - following reference pattern"""
        try:
            logger.info(f"🎬 Merging video with audio...")
            logger.info(f"Video: {video_path}")
            logger.info(f"Audio: {audio_path}")
            if subtitle_path:
                logger.info(f"Subtitles: {subtitle_path}")

            # Get video and audio durations
            video_duration_cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ]
            audio_duration_cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ]

            video_duration = float(
                subprocess.check_output(video_duration_cmd).decode("utf-8").strip()
            )
            audio_duration = float(
                subprocess.check_output(audio_duration_cmd).decode("utf-8").strip()
            )

            logger.info(
                f"📊 Video duration: {video_duration}s, Audio duration: {audio_duration}s"
            )

            input_video = video_path
            extended_video_temp = None

            # If audio is longer, extend the video with a freeze frame of the last frame
            if audio_duration > video_duration:
                logger.info(
                    f"⏱️ Audio is longer than video, extending video with freeze frame..."
                )
                extended_video_temp = str(
                    self.output_dir / f"{paper_id}_extended_temp.mp4"
                )

                extend_cmd = [
                    "ffmpeg",
                    "-y",
                    "-i",
                    video_path,
                    "-vf",
                    f"tpad=stop_mode=clone:stop_duration={audio_duration - video_duration}",
                    "-c:v",
                    "libx264",
                    extended_video_temp,
                ]

                subprocess.run(extend_cmd, check=True, capture_output=True, timeout=120)
                input_video = extended_video_temp
                logger.info(f"✅ Video extended to match audio duration")

            # Merge video with audio
            output_path = self.output_dir / f"{paper_id}_final_manim_animation.mp4"

            merge_cmd = ["ffmpeg", "-y", "-i", input_video, "-i", audio_path]

            filter_complex = []
            maps = ["-map", "0:v:0", "-map", "1:a:0"]

            # Add subtitle filter if available
            if subtitle_path and os.path.exists(subtitle_path):
                logger.info(f"📝 Adding subtitles from: {subtitle_path}")
                # Sanitize subtitle path for FFmpeg (cross-platform)
                import platform

                if platform.system() == "Windows":
                    escaped_path = subtitle_path.replace("\\", "\\\\").replace(
                        ":", "\\:"
                    )
                else:
                    escaped_path = (
                        subtitle_path.replace("'", "'\\''")
                        .replace(":", "\\:")
                        .replace(",", "\\,")
                        .replace("[", "\\[")
                        .replace("]", "\\]")
                    )
                filter_complex.append(f"ass='{escaped_path}'")

            if filter_complex:
                merge_cmd.extend(["-vf", ",".join(filter_complex)])

            merge_cmd.extend(maps)
            merge_cmd.extend(
                [
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-shortest",
                    str(output_path),
                ]
            )

            logger.info(f"🔧 Running FFmpeg merge command...")
            subprocess.run(merge_cmd, check=True, capture_output=True, timeout=120)

            # Cleanup temp files
            if extended_video_temp and os.path.exists(extended_video_temp):
                os.remove(extended_video_temp)
                logger.info("🧹 Removed temporary extended video file")

            logger.info(f"✅ Successfully merged audio and video: {output_path}")
            if subtitle_path:
                logger.info(f"✅ Subtitles embedded in video")

            return str(output_path)

        except subprocess.CalledProcessError as e:
            logger.error(f"❌ FFmpeg merge failed: {e.stderr}")
            return video_path  # Return original video if merge fails
        except Exception as e:
            logger.error(f"❌ Unexpected error during audio-video merge: {e}")
            return video_path  # Return original video if merge fails
