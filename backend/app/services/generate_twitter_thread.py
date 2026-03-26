import google.generativeai as genai
from typing import Dict, Union
import os
import re

MAX_PAPER_CHARS = 4000
DEFAULT_MODEL_NAME = "gemini-2.0-flash"


# -------- Emoji Number Converter --------
def to_emoji_number(number: int) -> str:
    if number == 10:
        return "🔟"  # avoids spacing issue like 1️⃣0️⃣

    digit_map = {
        "0": "0️⃣",
        "1": "1️⃣",
        "2": "2️⃣",
        "3": "3️⃣",
        "4": "4️⃣",
        "5": "5️⃣",
        "6": "6️⃣",
        "7": "7️⃣",
        "8": "8️⃣",
        "9": "9️⃣"
    }

    return "".join(digit_map[d] for d in str(number))


def generate_twitter_thread(
    api_key: str,
    paper_metadata: Dict[str, Union[str, list]],
    paper_text: str,
    model_name: str = DEFAULT_MODEL_NAME
) -> list[str]:

    if not api_key:
        raise ValueError("API key is required")

    if not paper_text.strip():
        raise ValueError("Paper text cannot be empty")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    title = paper_metadata.get("title") or "Untitled Research"

    raw_authors = paper_metadata.get("authors", "Unknown Authors")
    if isinstance(raw_authors, list):
        authors = "; ".join(raw_authors[:2])
    else:
        authors = raw_authors

    year = (
        paper_metadata.get("year")
        or paper_metadata.get("date")
        or "N/A"
    )

    arxiv_url = paper_metadata.get("arxiv_url", "")
    github_url = paper_metadata.get("github_url", "")

    prompt = _build_twitter_prompt(
        title=title,
        authors=authors,
        year=year,
        paper_text=paper_text[:MAX_PAPER_CHARS]
    )

    try:
        response = model.generate_content(prompt)

        if not response or not response.text:
            raise RuntimeError("Empty response from Gemini")

        thread_text = response.text.strip()

        # -------- Proper Tweet Extraction --------
        pattern = r"\d+\/\s?.*?(?=\n\d+\/|\Z)"
        matches = re.findall(pattern, thread_text, flags=re.DOTALL)

        if not matches:
            raise RuntimeError("Could not parse tweets correctly")

        # -------- Remove old numbering --------
        cleaned_tweets = []
        for tweet in matches:
            tweet = tweet.strip()
            tweet = re.sub(r"^\d+\/\s?", "", tweet)
            # Remove excessive blank lines (convert multiple \n to single \n)
            tweet = re.sub(r"\n\s*\n+", "\n", tweet)
            cleaned_tweets.append(tweet.strip())

        # -------- Add Emoji Numbering --------
        total = len(cleaned_tweets)

        numbered_tweets = [
            f"{to_emoji_number(i+1)}/{to_emoji_number(total)} {tweet}"
            for i, tweet in enumerate(cleaned_tweets)
        ]

        # -------- Append arXiv & GitHub Links to Final Tweet --------
        if numbered_tweets and (arxiv_url or github_url):
            links = []

            if arxiv_url:
                links.append(f"📄 arXiv: {arxiv_url}")

            if github_url:
                links.append(f"💻 Code: {github_url}")

            numbered_tweets[-1] += "\n\n" + "\n".join(links)
        # -------- Enforce 280 Character Limit (FINAL SAFETY) --------
        final_tweets = []

        for tweet in numbered_tweets:
            if len(tweet) > 280:
                tweet = tweet[:277].rstrip() + "."
            final_tweets.append(tweet)

        return final_tweets
        

    except Exception as exc:
        raise RuntimeError(
            "Failed to generate Twitter thread using Gemini"
        ) from exc


def _build_twitter_prompt(
    title: str,
    authors: str,
    year: str,
    paper_text: str
) -> str:
    return f"""
You are a research-focused Twitter content writer.

Generate a SINGLE professional Twitter thread (8–10 tweets).

STRICT FORMAT RULES:
- Each tweet must start with numbering: 1/, 2/, 3/, etc.
- Maximum 280 characters per tweet
- Professional and clear tone (can be slightly engaging where appropriate)
- Include 1–2 relevant emojis in EVERY tweet (no more than 2)
- Include relevant hashtags ONLY in the first tweet, placed on a new line at the end of that tweet. Do NOT include hashtags in any other tweets.
- Images can be included to support explanations 
- No unnecessary repetition
- No extra commentary outside the thread
- Output only the thread text

Required structure:
1/ #NewPaperAlert 🚀 + Paper Title  
   - FIRST line: "#NewPaperAlert 🚀" followed by the FULL paper title on the same line.
   - SECOND line: Show the authors (max 2) followed by the publication year in parentheses.
   - THIRD line: Write a concise 1 sentence summary of the paper.
   - FINAL line: Add relevant hashtags.
2/ Problem
3/ Gap
4/ Core idea
5/ Architecture
6/ Method
7/ Results
8/ Impact
9/ Limitations
10/ Final takeaway

Paper Details:
Title: {title}
Authors: {authors}
Year: {year}

Paper Content:
{paper_text}

Return ONLY the thread.
""".strip()