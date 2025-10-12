from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import List, Dict
import tempfile
import os
from pathlib import Path

from ..services.tts_service import generate_dialogue_audio_bhashini

from ..models.request_models import ReelVideoRequest
from ..services.shortform_video import generate_dialogue_video
from ..models.request_models import ReelAudioRequest
from ..models.request_models import ReelVideoRequest
from .get_podcast import extract_text_from_pdf, clean_text, generate_podcast_with_gemini, translate_dialogues_to_hindi, translate_dialogues_to_tamil

router = APIRouter(
    tags=["Reels"]
)

@router.get("/generate_reel")
async def generate_reel():
    """
    format for generate-audio
    [
  {
    "character": "A",
    "dialogue": "के, मैंने इस रिसर्च के बारे में पढ़ा, पर इसका असल में मतलब क्या है?"
  },
  {
    "character": "K",
    "dialogue": "बहुत अच्छा सवाल है! असल में, रिसर्चर्स ने AI को कम डेटा के साथ सिखाने का एक नया तरीका खोजा है।"
  },
  {
    "character": "A",
    "dialogue": "अच्छा, तो यह हमारे लिए कैसे फायदेमंद है?"
  },
  {
    "character": "K",
    "dialogue": "इससे AI मॉडल्स को ट्रेन करना सस्ता और तेज़ हो जाएगा, खासकर उन भाषाओं के लिए जिनमें ज़्यादा डेटा नहीं है।"
  }
]
    """

    return {"message": "Reel generation endpoint is operational."}

@router.post("/generate-audio", status_code=201)
async def create_reel_audio(request: ReelAudioRequest):
    """
    Receives a dialogue script and orchestrates the generation of audio files.
    """
    try:
        result = await generate_dialogue_audio_bhashini(
            language=request.language,
            paper_id=request.paper_id,
            dialogue_script=request.dialogue_script
        )
        return result
        
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        print(f"An unexpected error occurred in reel generation: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@router.post("/generate-video", status_code=200)
async def create_reel_video(request: ReelVideoRequest):
    """
    Receives a list of audio filenames and generates a dialogue video.
    """
    try:
        # Call the video generation function with the list of full paths
        video_path = generate_dialogue_video(paper_id = request.paper_id, audio_count = request.audio_count)
        
        return {
            "success": True,
            "video_path": video_path,
            "message": "Reel video generated successfully!"
        }

    except Exception as e:
        print(f"An unexpected error occurred in video generation: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred during video generation.")

@router.post("/generate_reel_from_pdf")
async def generate_reel_from_pdf(file: UploadFile = File(...), language: str = Form("english")):
    """
    Generate a short-form reel video from uploaded PDF.
    This endpoint extracts text, generates dialogue, creates audio, and produces a video.
    """
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Validate language selection
    if language.lower() not in ["english", "hindi", "tamil"]:
        raise HTTPException(status_code=400, detail="Language must be 'english', 'hindi', or 'tamil'")
    
    print(f"Generating reel in {language} language...")
    
    # Get API keys from environment variables
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY environment variable not set")
    
    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_pdf_path = temp_file.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving uploaded file: {str(e)}")
    
    try:
        # Extract text from the uploaded PDF
        print(f"Extracting text from uploaded PDF: {file.filename}")
        paper_text = extract_text_from_pdf(temp_pdf_path)
        
        if not paper_text or len(paper_text.strip()) < 100:
            raise HTTPException(status_code=400, detail="PDF appears to be empty or contains insufficient text")
        
        # Clean the extracted text
        paper_text = clean_text(paper_text)
        
        # Generate short-form dialogue using the robust function from get_podcast
        print("Generating short-form dialogue with Gemini (with Sarvam fallback)...")
        reel_dialogue = generate_reel_dialogue_with_fallback(gemini_api_key, paper_text)
        
        # Translate to Hindi or Tamil if requested
        if language.lower() == "hindi":
            print("Translating reel dialogue to Hindi...")
            reel_dialogue = translate_dialogues_to_hindi(reel_dialogue)
        elif language.lower() == "tamil":
            print("Translating reel dialogue to Tamil...")
            reel_dialogue = translate_dialogues_to_tamil(reel_dialogue)
        
        # Convert dialogue to format expected by audio generation
        dialogue_script = parse_dialogue_to_script(reel_dialogue)
        
        # Generate paper_id from filename
        paper_id = os.path.splitext(file.filename)[0].replace(" ", "_").replace("-", "_")
        
        # Generate audio files
        print("Generating audio for reel...")
        audio_result = await generate_dialogue_audio_bhashini(
            language=language,
            paper_id=paper_id,
            dialogue_script=dialogue_script
        )
        
        # Generate video from audio files
        print("Generating reel video...")
        print(f"Current working directory: {os.getcwd()}")
        
        # Get the backend root directory dynamically
        backend_root = Path(__file__).resolve().parent.parent.parent
        gen_dir = backend_root / "gen"
        gen_dir.mkdir(exist_ok=True)
        
        video_path = generate_dialogue_video(
            paper_id=paper_id, 
            audio_count=len(dialogue_script)
        )
        
        print(f"Video generation returned path: {video_path}")
        
        # Video should be created at backend/gen/reel_output.mp4 (same pattern as podcasts)
        expected_video_path = gen_dir / "reel_output.mp4"
        
        if expected_video_path.exists():
            video_filename = "reel_output.mp4"
            print(f"Video file found at expected location: {expected_video_path}")
        else:
            print(f"Video not found at expected location: {expected_video_path}")
            
            # Check if the returned path exists
            if video_path and os.path.exists(video_path):
                print(f"Video found at returned path: {video_path}")
                video_filename = os.path.basename(video_path)
            else:
                print("Video generation failed - no video file found")
                raise HTTPException(status_code=500, detail="Failed to generate video file")
        
        print("Reel generation completed successfully!")
        
        return {
            "success": True,
            "uploaded_file": file.filename,
            "language": language,
            "paper_text_length": len(paper_text),
            "dialogue_length": len(reel_dialogue),
            "dialogue": reel_dialogue,
            "dialogue_script": dialogue_script,
            "audio_files_count": len(dialogue_script),
            "video_path": video_path,
            "video_filename": video_filename,
            "message": f"Reel generated successfully in {language}! Video saved as {video_filename if video_filename else 'unknown'}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating reel: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating reel: {str(e)}")
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_pdf_path)
        except Exception as e:
            print(f"Warning: Could not delete temporary file: {str(e)}")

def generate_reel_dialogue_with_fallback(api_key: str, paper_text: str) -> str:
    """Generate short-form reel dialogue using the robust function from get_podcast with modified prompts."""
    import google.generativeai as genai
    import re
    from sarvamai import SarvamAI
    
    try:
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        system_prompt = """
            You are a skilled content creator specializing in short-form educational content for social media reels.

            Your task is to generate a quick, engaging, and punchy dialogue between two speakers — 
            Aisha and Rohan — as they discuss the key highlights of a research paper in a reel format.

            Dialogue Requirements:
            - Generate a SHORT dialogue with exactly 6-8 exchanges between speakers (perfect for 30-60 second reels)
            - Each dialogue line should be 15-25 words maximum (for quick delivery)
            - Use alternating lines with clear speaker tags (Aisha:, Rohan:)
            - Make it conversational, energetic, and hook-focused
            - Start with an attention-grabbing hook
            - Focus on the most interesting/surprising finding from the paper
            - End with a strong takeaway or call-to-action
            - Use simple, accessible language - no jargon
            - Make each line punchy and quotable

            Content Guidelines:
            - Lead with the most shocking/interesting fact from the paper
            - Explain the core concept in the simplest terms
            - Focus on real-world impact and "why should I care?"
            - Use questions and reactions to maintain engagement
            - Keep technical explanations to absolute minimum
            - End with practical implications or future possibilities
            - Output **only the dialogue text** (no narration or stage directions)

            Output Example:
            Aisha: Did you know scientists just figured out how to make batteries charge in 10 seconds?
            Rohan: Wait, what? That's impossible!
            Aisha: Not anymore! They used a new material that changes everything.
            Rohan: So my phone could charge fully in seconds?
            Aisha: Exactly! And it could last 10 times longer too.
            Rohan: This is going to revolutionize everything we use!

        """

        # Prepare the prompt
        prompt = f"""
            {system_prompt}

            Here is the research paper content to create a reel from:

            {paper_text[:6000]}  # Limit text for reel focus

            Please generate a short, engaging reel dialogue between Aisha and Rohan about the most interesting aspect of this research paper. 

            The dialogue should be 6-8 exchanges total, designed for a 60 second social media reel. Focus on the most surprising or impactful finding that would grab viewers' attention.
            """

        # Generate response
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.9,
                top_p=0.9,
                max_output_tokens=800,
            )
        )
        
        # Extract and clean the generated text
        dialogue = response.text
        
        # Remove any thinking tags if present
        dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
        
        print(f"✅ Successfully generated reel dialogue with Gemini (length: {len(dialogue)} characters)")
        return dialogue
        
    except Exception as gemini_error:
        print(f"❌ Gemini failed: {str(gemini_error)}")
        
        # Check if it's a quota/rate limit error
        if "429" in str(gemini_error) or "quota" in str(gemini_error).lower() or "rate limit" in str(gemini_error).lower():
            print("🔄 Falling back to Sarvam AI...")
            
            try:
                # Get Sarvam API key
                sarvam_api_key = os.getenv("SARVAM_API_KEY")
                if not sarvam_api_key:
                    raise Exception("SARVAM_API_KEY environment variable not set for fallback")
                
                # Use Sarvam AI as fallback
                client = SarvamAI(api_subscription_key=sarvam_api_key)
                
                # System prompt for Sarvam AI
                system_prompt_clean = """You are a skilled content creator specializing in short-form educational content for social media reels.

Your task is to generate a quick, engaging, and punchy dialogue between two speakers — 
Aisha and Rohan — as they discuss the key highlights of a research paper in a reel format.

Dialogue Requirements:
- Generate a SHORT dialogue with exactly 6-8 exchanges between speakers (perfect for 30-60 second reels)
- Each dialogue line should be 15-25 words maximum (for quick delivery)
- Use alternating lines with clear speaker tags (Aisha:, Rohan:)
- Make it conversational, energetic, and hook-focused
- Start with an attention-grabbing hook
- Focus on the most interesting/surprising finding from the paper
- End with a strong takeaway or call-to-action
- Use simple, accessible language - no jargon
- Make each line punchy and quotable

Content Guidelines:
- Lead with the most shocking/interesting fact from the paper
- Explain the core concept in the simplest terms
- Focus on real-world impact and "why should I care?"
- Use questions and reactions to maintain engagement
- Keep technical explanations to absolute minimum
- End with practical implications or future possibilities
- Output **only the dialogue text** (no narration or stage directions)

Output Example:
Aisha: Did you know scientists just figured out how to make batteries charge in 10 seconds?
Rohan: Wait, what? That's impossible!
Aisha: Not anymore! They used a new material that changes everything.
Rohan: So my phone could charge fully in seconds?
Aisha: Exactly! And it could last 10 times longer too.
Rohan: This is going to revolutionize everything we use!"""
                                
                user_prompt = f"""
Here is the research paper content to create a reel from:

{paper_text[:6000]}

Please generate a short, engaging reel dialogue between Aisha and Rohan about the most interesting aspect of this research paper. 

The dialogue should be 12-14 exchanges total, designed for a 60 second social media reel. Focus on the most surprising or impactful finding that would grab viewers' attention.
"""
                
                res = client.chat.completions(
                    messages=[
                        {"content": system_prompt_clean, "role": "system"}, 
                        {"content": user_prompt, "role": "user"}
                    ],
                    max_tokens=800,
                )
                
                dialogue = res.choices[0].message.content
                
                # Remove any thinking tags if present
                dialogue = re.sub(r"<think>.*?</think>", "", dialogue, flags=re.DOTALL).strip()
                
                print(f"✅ Successfully generated reel dialogue with Sarvam AI (fallback) (length: {len(dialogue)} characters)")
                return dialogue
                
            except Exception as sarvam_error:
                print(f"❌ Sarvam AI fallback also failed: {str(sarvam_error)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Both Gemini and Sarvam AI failed. Gemini: {str(gemini_error)}. Sarvam: {str(sarvam_error)}"
                )
        else:
            # For non-quota errors, just raise the original Gemini error
            raise HTTPException(status_code=500, detail=f"Error generating reel dialogue: {str(gemini_error)}")

def parse_dialogue_to_script(dialogue: str) -> List[Dict[str, str]]:
    """Convert dialogue text to the format expected by audio generation."""
    try:
        lines = dialogue.split('\n')
        script = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if line contains speaker dialogue
            if ':' in line and (line.startswith('Aisha:') or line.startswith('Rohan:')):
                parts = line.split(':', 1)
                speaker = parts[0].strip()
                dialogue_text = parts[1].strip()
                
                # Map speakers to characters for reel format
                character = "K" if speaker == "Aisha" else "A"
                
                script.append({
                    "character": character,
                    "dialogue": dialogue_text
                })
        
        print(f"✅ Parsed dialogue into {len(script)} script segments")
        return script
        
    except Exception as e:
        print(f"❌ Error parsing dialogue to script: {str(e)}")
        return []

@router.get("/stream_video/{filename}")
async def stream_reel_video(filename: str):
    """Stream video file for reel playback"""
    try:
        # Validate filename to prevent directory traversal (same as podcast audio)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        # Get the backend root directory and look for video in gen directory
        backend_root = Path(__file__).resolve().parent.parent.parent
        file_path = backend_root / "gen" / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        return FileResponse(
            path=str(file_path),
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error streaming video file: {str(e)}")

@router.get("/download_video/{filename}")
async def download_reel_video(filename: str):
    """Download video file for reel"""
    try:
        # Validate filename to prevent directory traversal (same as podcast audio)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        # Get the backend root directory and look for video in gen directory
        backend_root = Path(__file__).resolve().parent.parent.parent
        file_path = backend_root / "gen" / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        return FileResponse(
            path=str(file_path),
            media_type="video/mp4",
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving video file: {str(e)}")

