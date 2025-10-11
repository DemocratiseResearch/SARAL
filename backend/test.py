import os
import shutil
import uuid
from pathlib import Path
import argparse  # Import argparse to handle command-line arguments

# Ensure the app directory is in the Python path
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

try:
    # Import the functions we want to test from your application
    from app.services.pdf_processor import process_pdf_file
    from langchain.text_splitter import RecursiveCharacterTextSplitter
except ImportError as e:
    print(f"Error: Missing necessary libraries. Please ensure all dependencies from requirements.txt are installed.")
    print(f"Import error: {e}")
    sys.exit(1)


def test_pdf_processing_and_chunking(pdf_path: str):
    """
    Tests the PDF processing and text chunking stages of the RAG pipeline.
    """
    print(f"\n--- Starting Test for PDF: {pdf_path} ---")
    paper_id = str(uuid.uuid4())
    
    try:
        # 1. Test PDF Processing (Text Extraction)
        print(f"\n[Step 1/3] Processing PDF with paper_id: {paper_id}...")
        paper_info = process_pdf_file(pdf_path, paper_id)
        
        text_file_path = paper_info.get("text_file_path")
        if not text_file_path or not os.path.exists(text_file_path):
            print("❌ TEST FAILED: `process_pdf_file` did not create a text file.")
            return

        print(f"✅ SUCCESS: PDF processed. Text extracted to: {text_file_path}")

        # 2. Read the Extracted Text
        print("\n[Step 2/3] Reading extracted text...")
        with open(text_file_path, "r", encoding="utf-8") as f:
            document_text = f.read()
        
        if not document_text.strip():
            print("❌ TEST FAILED: Extracted text file is empty.")
            return
            
        print(f"✅ SUCCESS: Read {len(document_text)} characters from the text file.")

        # 3. Test Text Chunking
        print("\n[Step 3/3] Splitting text into chunks...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = text_splitter.split_text(document_text)

        if not chunks:
            print("❌ TEST FAILED: Text splitting resulted in zero chunks.")
            return

        print(f"✅ SUCCESS: Text split into {len(chunks)} chunks.")
        
        # --- Final Report ---
        print("\n--- Test Report ---")
        print(f"Total Chunks Created: {len(chunks)}")
        print("\n--- Sample Chunks ---")
        for i, chunk in enumerate(chunks[:2]): # Print the first 2 chunks
            print(f"\n--- Chunk {i+1} ({len(chunk)} chars) ---")
            print(chunk)
            print("--------------------")

        print("\n✅✅✅ TEST PASSED SUCCESSFULLY ✅✅✅")

    except Exception as e:
        print(f"\n❌❌❌ TEST FAILED with an exception ❌❌❌")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Clean up the temporary directory created by process_pdf_file
        cleanup_dir = f"temp/papers/{paper_id}"
        if os.path.exists(cleanup_dir):
            shutil.rmtree(cleanup_dir)
            print(f"\n🧹 Cleaned up temporary directory: {cleanup_dir}")


if __name__ == "__main__":
    # Set up command-line argument parsing
    parser = argparse.ArgumentParser(description="Test the RAG pre-processing pipeline with a given PDF.")
    parser.add_argument("pdf_path", type=str, help="The full path to the PDF file you want to test.")
    
    args = parser.parse_args()

    # Validate the input file path
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"❌ Error: The file '{pdf_path}' does not exist.")
        sys.exit(1)
        
    if not pdf_path.is_file() or pdf_path.suffix.lower() != '.pdf':
        print(f"❌ Error: The provided path '{pdf_path}' is not a valid PDF file.")
        sys.exit(1)

    # Run the test with the user-provided PDF
    test_pdf_processing_and_chunking(str(pdf_path))
