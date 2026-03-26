import os
import requests
import shutil
import re
import tarfile
import gzip
from bs4 import BeautifulSoup
from pathlib import Path
from app.utils.timing import track_performance

class ArxivScraper:
    """Scraper for downloading TeX source files from arXiv papers."""
    
    @track_performance
    def __init__(self, download_dir="temp/arxiv_sources"):
        self.download_dir = download_dir
        os.makedirs(download_dir, exist_ok=True)
    @track_performance
    def extract_arxiv_id(self, url):
        """Extract the arXiv ID from a given URL."""
        match = re.search(r'arxiv\.org/(?:abs|pdf)/([0-9]+\.[0-9]+)(?:v[0-9]+)?', url)
        if match:
            return match.group(1)
        return None
    @track_performance
    def download_source(self, url):
        """Download the TeX source file for a given arXiv paper URL."""
        arxiv_id = self.extract_arxiv_id(url)
        if not arxiv_id:
            raise ValueError(f"Could not extract arXiv ID from URL: {url}")

        paper_dir = os.path.join(self.download_dir, arxiv_id.replace(".", "_"))
        os.makedirs(paper_dir, exist_ok=True)

        source_url = f"https://arxiv.org/e-print/{arxiv_id}"
        
        try:
            print(f"Downloading source for arXiv paper {arxiv_id}...")
            response = requests.get(source_url, stream=True)
            response.raise_for_status()

            download_path = os.path.join(paper_dir, f"{arxiv_id}.tar.gz")
            with open(download_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            extracted_dir = os.path.join(paper_dir, "source")
            os.makedirs(extracted_dir, exist_ok=True)

            extracted_successfully = False
            try:
                print(f"Attempting to extract as tar.gz: {download_path}")
                with tarfile.open(download_path) as tar:
                    file_list = tar.getnames()
                    print(f"Found {len(file_list)} files in tar archive")
                    
                    for member in tar.getmembers():
                        if member.name.startswith('/') or '..' in member.name:
                            continue
                        try:
                            tar.extract(member, path=extracted_dir)
                        except Exception as extract_error:
                            print(f"Error extracting {member.name}: {extract_error}")
                    extracted_successfully = True
                    
            except tarfile.ReadError:
                try:
                    print(f"Attempting to extract as gzip: {download_path}")
                    with gzip.open(download_path, 'rb') as f_in:
                        extracted_file = os.path.join(extracted_dir, f"{arxiv_id}.tex")
                        with open(extracted_file, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    extracted_successfully = True
                except Exception:
                    pass

            if not extracted_successfully:
                fallback_file = os.path.join(extracted_dir, f"{arxiv_id}.raw")
                shutil.copy2(download_path, fallback_file)

            extracted_files = os.listdir(extracted_dir)
            if extracted_files:
                print(f"Successfully downloaded and extracted source to {extracted_dir}")
                return extracted_dir
            else:
                raise Exception("Extraction produced no files")

        except Exception as e:
            print(f"Error during download/extraction: {e}")
            raise
    @track_performance
    def get_paper_metadata(self, url):
        """Get metadata for the paper (title, authors, date)."""
        try:
            response = requests.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')

            title_elem = soup.find('h1', class_='title mathjax')
            title = title_elem.get_text().replace('Title:', '').strip() if title_elem else "Unknown Title"

            authors_elem = soup.find('div', class_='authors')
            authors = authors_elem.get_text().replace('Authors:', '').strip() if authors_elem else "Unknown Authors"

            date_elem = soup.find('div', class_='dateline')
            date = date_elem.get_text().strip() if date_elem else "Unknown Date"

            return {
                "title": title,
                "authors": authors,
                "date": date
            }
        except Exception as e:
            print(f"Error fetching metadata: {e}")
            return {
                "title": "Unknown Title",
                "authors": "Unknown Authors", 
                "date": "Unknown Date"
            }
