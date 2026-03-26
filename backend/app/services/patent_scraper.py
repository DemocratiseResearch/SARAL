import os
import requests
import re
from app.utils.timing import track_performance


class PatentScraper:
    """
    Scraper for fetching patent data from Google Patents via the SerpApi service.
    This class retrieves structured data including abstract, description, claims,
    and drawing images.
    """
    
    BASE_URL = "https://serpapi.com/search.json"

    @track_performance
    def __init__(self, api_key: str):
        """
        Initializes the PatentScraper with the necessary SerpApi key.

        Args:
            api_key (str): Your SerpApi private API key.
        """
        if not api_key:
            raise ValueError("SerpApi API key is required.")
        self.api_key = api_key

    @track_performance
    def _extract_patent_id(self, identifier: str) -> str:
        """
        Extracts the patent ID from a URL or a string.
        Handles common Google Patents URL formats and direct patent numbers.

        Args:
            identifier (str): The patent number or the full Google Patents URL.

        Returns:
            str: The extracted patent ID.
        """
        # Regex to find patent IDs like US20220185128A1, US10825484B2, etc.
        pattern = r"([A-Z]{2}\d+[A-Z]\d{1,2})"
        match = re.search(pattern, identifier, re.IGNORECASE)
        if match:
            return match.group(1).upper()
        
        # If no regex match, assume the identifier is the patent ID itself
        return identifier.strip()

    @track_performance
    def fetch_patent_data(self, identifier: str) -> dict:
        """
        Fetches the full structured data for a given patent ID or URL.

        Args:
            identifier (str): The patent number or URL to look up.

        Returns:
            dict: A dictionary containing the patent's title, date, abstract,
                  description, claims, and a list of drawing URLs.
                  Returns None if the patent is not found or an error occurs.
        """
        patent_id = self._extract_patent_id(identifier)
        if not patent_id:
            raise ValueError(f"Could not extract a valid patent ID from: {identifier}")

        print(f"Fetching data for patent ID: {patent_id}...")

        params = {
            "engine": "google_patents",
            "q": patent_id,
            "api_key": self.api_key
        }

        try:
            response = requests.get(self.BASE_URL, params=params)
            response.raise_for_status()  # Raise an exception for bad status codes
            data = response.json()

            if "error" in data:
                print(f"SerpApi Error: {data['error']}")
                return None

            patent_info = data.get("patent", {})
            
            # Extract key information, providing fallbacks
            processed_data = {
                "metadata": {
                    "title": patent_info.get("title", "Unknown Title"),
                    "authors": ", ".join([inventor["name"] for inventor in patent_info.get("inventors", [])]),
                    "date": patent_info.get("publication_date", "Unknown Date"),
                    "patent_id": patent_id
                },
                "abstract": patent_info.get("abstract", ""),
                "description": patent_info.get("description_html", ""),
                "claims": patent_info.get("claims_html", ""),
                "drawings": [drawing["image"] for drawing in data.get("drawings", []) if "image" in drawing]
            }
            
            print(f"Successfully fetched data for patent: {processed_data['metadata']['title']}")
            return processed_data

        except requests.exceptions.RequestException as e:
            print(f"An error occurred while fetching data from SerpApi: {e}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return None