import google.generativeai as genai
import os
from typing import Dict, Optional
import re
from app.utils.timing import track_performance

@track_performance
def generate_linkedin_caption_with_gemini(api_key: str, paper_metadata: Dict, paper_text: str, platform_url: Optional[str] = None) -> str:
    """
    Generate a professional LinkedIn caption based on the paper content.
    
    Args:
        api_key: Gemini API key
        paper_metadata: Dictionary containing title, authors, date
        paper_text: The extracted text content from the paper
        platform_url: Optional URL to the paper on the platform
        
    Returns:
        A formatted LinkedIn caption ready to be posted
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')
    
    # Extract metadata
    title = paper_metadata.get("title", "Research Paper")
    authors = paper_metadata.get("authors", "")
    date = paper_metadata.get("date", "")
    
    prompt = f"""
You are a professional LinkedIn content creator specializing in research communication. 
Create an engaging LinkedIn post based on this research paper that will attract attention from professionals, researchers, and industry leaders.

PAPER DETAILS:
- Title: {title}
- Authors: {authors}
- Publication Date: {date}

PAPER CONTENT:
{paper_text[:4000]}  # Limit to avoid token overflow

REQUIREMENTS FOR THE LINKEDIN POST:
1. START with a compelling hook - either a thought-provoking question or a bold statement that relates to the research
2. OPENING: Briefly introduce the research problem or challenge being addressed (1-2 sentences)
3. KEY FINDINGS: Highlight the most important findings or contributions (2-3 bullet points with emojis like 👉, ✅, 💡)
4. IMPACT: Explain the practical implications or potential applications for industry/society
5. SARAL AI MENTION: Include a section about sharing this work using SARAL AI (an initiative by ANRF to make research accessible)
   - Mention it helps democratize research and make it available in multiple languages
   - Express gratitude to ANRF for the platform
6. CALL TO ACTION: Add engaging CTAs with emojis like:
   📖 Read the original research: [PAPER_LINK]
   🎧 Listen to the podcast: [PODCAST_LINK]
   🎬 Watch the visual summary: [VIDEO_LINK]
7. HASHTAGS: Include 10-15 relevant hashtags covering:
   - Research democratization (#DemocratizingResearch, #ScienceForAll, #OpenAccess, #SARALAI)
   - The research topic/field
   - Key institutions or organizations mentioned
   - General research/innovation tags

TONE AND STYLE:
- Professional yet accessible and engaging
- Use emojis strategically (but not excessively)
- Write in first person to make it personal
- Keep paragraphs short for readability
- Use line breaks between sections
- Be enthusiastic but not overly promotional

FORMAT:
[Hook/Opening Question]

[Brief context about the research - 2-3 sentences]

[Key findings with bullet points and emojis]

[Impact/Application paragraph]

[SARAL AI paragraph about democratizing research]

[Call to action sections with links]

[Hashtags]

Generate the LinkedIn caption now:
"""

    try:
        response = model.generate_content(prompt)
        caption = response.text.strip()
        
        # Post-process the caption to add placeholder links if platform_url is provided
        if platform_url:
            caption = caption.replace("[PAPER_LINK]", platform_url)
            caption = caption.replace("[PODCAST_LINK]", f"{platform_url}/podcast")
            caption = caption.replace("[VIDEO_LINK]", f"{platform_url}/video")
        
        return caption
    except Exception as e:
        print(f"Error generating LinkedIn caption with Gemini: {e}")
        raise


@track_performance
def generate_short_linkedin_caption(api_key: str, paper_metadata: Dict, paper_text: str) -> str:
    """
    Generate a shorter LinkedIn caption focused on key findings.
    
    Args:
        api_key: Gemini API key
        paper_metadata: Dictionary containing title, authors, date
        paper_text: The extracted text content from the paper
        
    Returns:
        A shorter LinkedIn caption
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')
    
    title = paper_metadata.get("title", "Research Paper")
    
    prompt = f"""
Create a concise but engaging LinkedIn post (max 200 words) for this research paper.

Title: {title}
Content: {paper_text[:3000]}

Requirements:
1. Start with an attention-grabbing hook or question
2. Summarize the key finding in 2-3 sentences
3. Add 1-2 practical implications
4. End with relevant hashtags (5-8 hashtags)
5. Use emojis strategically
6. Professional but accessible tone

Generate the short LinkedIn caption:
"""

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error generating short LinkedIn caption: {e}")
        raise





@track_performance
def format_linkedin_caption(raw_caption: str, title: str) -> str:
    """
    Add title at top and insert SaralAI line before hashtags.
    """
    cleaned = raw_caption.replace("**", "").strip()
    
    # Find where hashtags start
    lines = cleaned.splitlines()
    hashtag_index = None
    
    for i, line in enumerate(lines):
        if line.strip().startswith("#"):
            hashtag_index = i
            break
    
    # Ensure #SARALAI hashtag exists
    if "#SARALAI" not in cleaned.upper():
        if hashtag_index is not None:
            # Add #SARALAI to the hashtag line
            lines[hashtag_index] = lines[hashtag_index].rstrip() + " #SARALAI"
        else:
            # No hashtags found, add a new line with #SARALAI
            lines.append("#SARALAI")
    
    # # Reconstruct the caption with title at top
    # final_caption = f"Paper Titled: {title}\n\n" + "\n".join(lines)
    
    # return final_caption.strip()
    video_url = ""
    # Create the video line
    if video_url:
        video_line = f"🎥 Video has been generated by SARALAI: {video_url}"
    else:
        video_line = "🎥 Video has been generated by SARALAI: [Please paste your video URL]"
    
    # Reconstruct the caption with title at top and video line
    final_caption = f"Paper Titled: {title}\n\n" + "\n".join(lines) + f"\n\n{video_line}"
    
    return final_caption.strip()


@track_performance
def generate_linkedin_caption_points(api_key: str, paper_metadata: Dict, paper_text: str) -> str:
    """
    Generate a shorter LinkedIn caption focused on key findings.
    
    Args:
        api_key: Gemini API key
        paper_metadata: Dictionary containing title, authors, date
        paper_text: The extracted text content from the paper
        
    Returns:
        A shorter LinkedIn caption with proper formatting
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')
    
    title = paper_metadata.get("title", "Research Paper")
    
    prompt = f"""
Create a concise, professional LinkedIn post (max 200 words) for the following research paper.

Title: {title}
Content: {paper_text[:3000]}

Structure the post EXACTLY as follows (PLAIN TEXT ONLY — no markdown, no **, no bullets with *, use hyphens):

1. Two-line summary
- Exactly 2 short, clear lines.

2. Key Contributions
- Exactly 3 bullet points using hyphens (-)

3. Key Findings
- 2 or 3 bullet points using hyphens (-)

4. Closing
- One short concluding sentence
- 5–8 relevant hashtags (ensure they're on the same line, space-separated)

Rules:
- DO NOT use **, *, markdown, or numbering symbols like **Title**
- Plain text only
- Professional LinkedIn tone
- 1–3 emojis maximum
- Do NOT exceed 200 words
- Put all hashtags on a single line at the end

Generate the LinkedIn caption now:
"""

    try:
        response = model.generate_content(prompt)
        raw_caption = response.text.strip()
        print("raw_caption:", raw_caption)
        
        edited_text = format_linkedin_caption(raw_caption, title)
        print("\nedited_text:", edited_text)
        
        return edited_text  # Return the formatted caption, not the raw response
    except Exception as e:
        print(f"Error generating short LinkedIn caption: {e}")
        raise


