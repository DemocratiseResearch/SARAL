import os
import re
from google import genai
from google.genai import types as genai_types
import logging

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

BASE_MANIM_INSTRUCTIONS = """
🎯 GOLDEN RULE: Create ANIMATIONS that show concepts, not text walls!

VISUAL STYLE (MANDATORY):
- Background: self.camera.background_color = '#F5F5DC' (beige/cream) 
- Text/Diagrams: BLACK color for everything
- High contrast for readability

MANIM v0.19.0 REQUIREMENTS:
- Use np.array([x, y, 0]) for all vectors
- Valid animations: Write(), Create(), FadeIn(), FadeOut(), Transform(), ReplacementTransform()
- Valid objects: Text(), MathTex(), Circle(), Square(), Rectangle(), Arrow(), Line(), Dot()
- NO ImageMobject, NO external files, NO 3D scenes
- NO TransformFromAbove/TransformFromBelow (don't exist!)

ANIMATION FOCUS:
- Show concepts through motion and transformation
- Use Transform() to demonstrate relationships
- Highlight with Indicate() and Circumscribe()
- Text for LABELS only, narration explains

TIMING:
- Total: 60 seconds exactly
- Narration: 150-160 words
- Use self.play() with run_time and self.wait() for pacing

COMMON FIXES:
- Replace VGroup(text, image) with Group(text, image)
- Replace ImageMobject with geometric shapes
- Replace invalid transforms with Write() or FadeIn()
- Ensure all imports: from manim import *, import numpy as np
- Add background color at start: self.camera.background_color = '#F5F5DC'
"""

FALLBACK_SYSTEM_PROMPT = """You are an expert Manim programmer fixing broken code and creating beautiful 60-second animations with Manim Community v0.19.0.

VISUAL PHILOSOPHY:
- Create ANIMATIONS that demonstrate concepts through motion
- Beige background (#F5F5DC) with BLACK text/diagrams
- Minimal text, maximum animation
- Show relationships through Transform() and movement

TIMING:
- Total: 60 seconds
- Narration: 150-160 words
- Structure: 8-10s intro, 40-45s main, 7-10s outro

CRITICAL RULES:
- Use only proven Manim v0.19.0 methods
- NO ImageMobject or external files
- NO invalid transforms (TransformFromAbove doesn't exist)
- Focus on VISUAL animations, not text displays

OUTPUT FORMAT:
- Start Manim code with: ### MANIM CODE:
- Start narration with: ### NARRATION:
- End after narration
"""


def fix_manim_code(faulty_code: str, error_message: str, original_context: str):
    """
    Enhanced fallback function with Google Search integration.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logging.error("GEMINI_API_KEY not found in environment variables for fallback.")
        return None, None

    client = genai.Client(api_key=api_key)

    # Enhanced fallback prompt with better structure and error analysis
    fix_prompt_text = f"""
TASK: Fix the broken Manim code that failed with a specific error.

### ORIGINAL REQUEST:
{original_context}

### BROKEN MANIM CODE:
```python
{faulty_code}
```

### ERROR ENCOUNTERED:
```
{error_message}
```

### ANALYSIS INSTRUCTIONS:
1. **Error Analysis**: Identify the issue:
   - Import errors (missing 'from manim import *' or 'import numpy as np')
   - Scene class not found (must inherit from Scene)
   - Invalid Manim methods or syntax
   - Vector dimension errors (use np.array([x, y, 0]))
   - Missing background color (should be '#F5F5DC')
   - Too much text, not enough animation

2. **Google Search**: Find:
   - Manim Community v0.19.0 API updates
   - Error message solutions
   - Working animation examples

3. **Fixing Strategy**:
   - Keep the animation concept but fix errors
   - Add: self.camera.background_color = '#F5F5DC' at start
   - Use BLACK color for all text/shapes
   - Focus on ANIMATIONS not text paragraphs
   - Maintain 60-second duration and 150-160 word narration

4. **Visual Enhancement**:
   - Replace static text with animated demonstrations
   - Use Transform() to show concept relationships
   - Add Indicate() and Circumscribe() for emphasis
   - Ensure smooth transitions with FadeIn/FadeOut

### OUTPUT FORMAT:
Provide response in this format:

### MANIM CODE:
[Complete fixed Manim code with:
 - All imports (from manim import *, import numpy as np)
 - Background color set to '#F5F5DC'
 - All text/shapes in BLACK
 - Animation-focused approach]

### NARRATION:
[Narration script: 150-160 words explaining what animations show]

### REQUIREMENTS:
{BASE_MANIM_INSTRUCTIONS}
"""

    contents = [fix_prompt_text]

    logging.info("Attempting to fix Manim code via fallback...")
    try:
        grounding_tool = genai_types.Tool(google_search=genai_types.GoogleSearch())

        generation_config = genai_types.GenerateContentConfig(
            tools=[grounding_tool],
            temperature=0.4,  # lower coz grounding
            system_instruction=FALLBACK_SYSTEM_PROMPT,
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=fix_prompt_text,
            config=generation_config,
        )
        if response:
            # print(response)
            try:
                content = response.text
                logging.info("Received response from fallback attempt.")

                if content and "### NARRATION:" in content:
                    manim_code, narration = content.split("### NARRATION:", 1)
                    manim_code = (
                        re.sub(r"```python", "", manim_code).replace("```", "").strip()
                    )
                    narration = narration.strip()

                    if "from manim import *" not in manim_code:
                        logging.warning(
                            "Adding missing 'from manim import *' (fallback fix)."
                        )
                        manim_code = (
                            "from manim import *\nimport numpy as np\n" + manim_code
                        )
                    elif "import numpy as np" not in manim_code:
                        logging.warning(
                            "Adding missing 'import numpy as np' (fallback fix)."
                        )
                        lines = manim_code.splitlines()
                        for i, line in enumerate(lines):
                            if "from manim import *" in line:
                                lines.insert(i + 1, "import numpy as np")
                                manim_code = "\n".join(lines)
                                break

                    logging.info(
                        "Successfully parsed fixed code and narration from fallback."
                    )
                    return {
                        "manim_code": manim_code,
                        "output_file": "output.mp4",
                    }, narration
                elif content:
                    logging.warning(
                        "Delimiter '### NARRATION:' not found in fallback response. Attempting fallback extraction."
                    )
                    code_match = re.search(r"```python(.*?)```", content, re.DOTALL)
                    if code_match:
                        manim_code = code_match.group(1).strip()
                        narration_part = content.split("```", 2)[-1].strip()
                        narration = narration_part if len(narration_part) > 20 else ""
                        if not narration:
                            logging.warning(
                                "Fallback narration extraction resulted in empty or very short text (fallback fix)."
                            )
                        else:
                            logging.info(
                                "Successfully parsed code and narration using fallback regex (fallback fix)."
                            )

                        if "from manim import *" not in manim_code:
                            logging.warning(
                                "Adding missing 'from manim import *' (fallback fix, regex path)."
                            )
                            manim_code = (
                                "from manim import *\nimport numpy as np\n" + manim_code
                            )
                        elif "import numpy as np" not in manim_code:
                            logging.warning(
                                "Adding missing 'import numpy as np' (fallback fix, regex path)."
                            )
                            lines = manim_code.splitlines()
                            for i, line in enumerate(lines):
                                if "from manim import *" in line:
                                    lines.insert(i + 1, "import numpy as np")
                                    manim_code = "\n".join(lines)
                                    break

                        logging.info(
                            "Successfully parsed fixed code using fallback extraction."
                        )
                        return {
                            "manim_code": manim_code,
                            "output_file": "output.mp4",
                        }, narration
                    else:
                        logging.error(
                            "Fallback extraction failed: No Python code block found in fallback response."
                        )
                        logging.debug(
                            f"Fallback content without code block:\n{content}"
                        )
                        return None, None
                else:
                    logging.error("No content received from fallback response.")
                    return None, None

            except ValueError:
                logging.error("Could not extract text from the fallback response.")
                if response.prompt_feedback and response.prompt_feedback.block_reason:
                    logging.error(
                        f"Fallback content generation blocked. Reason: {response.prompt_feedback.block_reason.name}"
                    )
                return None, None
            except Exception as e:
                logging.exception(f"Error processing fallback response: {e}")
                return None, None
        else:
            logging.error("No response received from Gemini during fallback attempt.")
            return None, None

    except Exception as e:
        logging.exception(f"Error calling Gemini API during fallback: {e}")
        return None, None
