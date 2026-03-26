import os
import json
from json import JSONDecodeError
import google.generativeai as genai
import pdfplumber
from app.models.request_models import PatentMetadata
from app.utils.timing import track_performance

@track_performance
def get_patent_metadata_from_pdf(pdf_path: str, gemini_api_key: str) -> PatentMetadata:
    """
    Extracts metadata from a patent PDF using the Gemini API.

    Args:
        pdf_path: The path to the patent PDF file.
        gemini_api_key: The API key for the Gemini API.

    Returns:
        A PatentMetadata object.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"The file {pdf_path} was not found.")

    genai.configure(api_key=gemini_api_key)

    with pdfplumber.open(pdf_path) as pdf:
        text = "\n".join(page.extract_text() for page in pdf.pages)

    model = genai.GenerativeModel('gemini-2.5-flash-lite')
    prompt = f"""
    You are an expert patent metadata extractor.
    Extract the following metadata from the patent text below:
    - title: The title of the patent.
    - patent_id: The patent identification number. It should not contain spaces or commas or any characters other than letters and numbers.
    - inventors: The names of the inventors, as a single comma-separated string.
    - assignee: The name of the assignee.
    - publication_date: The date of publication in YYYY-MM-DD format.
    - abstract: The abstract of the patent.

    Your response MUST be a valid JSON object with the following keys: "title", "patent_id", "inventors", "assignee", "publication_date", "abstract".

    **Example Output:**
    ```json
    {{
      "title": "Example Patent Title",
      "patent_id": "US20220123456A1",
      "inventors": "John Doe, Jane Smith",
      "assignee": "Example Company Inc.",
      "publication_date": "2022-01-20",
      "abstract": "This is an example abstract."
    }}
    ```

    Patent Text:
    {text}
    """
    response = model.generate_content(prompt)

    try:
        cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        metadata_json = json.loads(cleaned_response_text)

        # Ensure inventors are a string
        inventors = metadata_json.get("inventors")
        if isinstance(inventors, list):
            inventors = ", ".join(inventors)

        return PatentMetadata(
            title=metadata_json.get("title", "Unknown Title"),
            patent_id=metadata_json.get("patent_id", "Not found"),
            inventors=inventors,
            publication_date=metadata_json.get("publication_date", "Unknown Date"),
            assignee=metadata_json.get("assignee", "Not found"),
        )
    except (JSONDecodeError, TypeError) as e:
        print(f"Error decoding JSON from Gemini response: {e}")
        print(f"Response text: {response.text}")
        return PatentMetadata(
            title="Unknown Title",
            patent_id="Not found",
            inventors="Unknown Inventors",
            publication_date="Unknown Date"
        )
