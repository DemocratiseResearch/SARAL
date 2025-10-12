"""
Example usage of the enhanced PDF processor with OpenDataLoader

This demonstrates how to use the new OpenDataLoader-based PDF processing features.
"""

import sys
import os

# Add the parent directory to path to import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pdf_processor import (
    extract_text_from_pdf,
    extract_with_full_features,
    summarize_pdf_content,
    process_pdf_file,
)


def example_basic_extraction():
    """Example: Basic text extraction from PDF"""
    print("=" * 60)
    print("Example 1: Basic Text Extraction")
    print("=" * 60)

    pdf_path = "path/to/your/paper.pdf"

    # Extract text and structured data
    text, structured_data = extract_text_from_pdf(pdf_path)

    if text:
        print(f"✓ Extracted {len(text):,} characters")
        print(f"✓ Has structured data: {structured_data is not None}")

        # Show first 500 characters
        print("\nFirst 500 characters:")
        print(text[:500])
    else:
        print("✗ Failed to extract text")


def example_full_features():
    """Example: Full-featured extraction with all outputs"""
    print("\n" + "=" * 60)
    print("Example 2: Full-Featured Extraction")
    print("=" * 60)

    pdf_path = "path/to/your/paper.pdf"
    output_dir = "temp/pdf_extraction"

    # Extract with all features
    result = extract_with_full_features(
        pdf_path,
        generate_markdown=True,
        generate_html=True,
        generate_annotated_pdf=True,
        output_dir=output_dir,
    )

    if result:
        print(f"✓ Text extracted: {len(result['text']):,} characters")
        print(f"✓ Structured data: {result['structured_data'] is not None}")
        print(f"✓ Markdown generated: {result['markdown_path']}")
        print(f"✓ HTML generated: {result['html_path']}")
        print(f"✓ Annotated PDF: {result['annotated_pdf_path']}")
        print(f"✓ Output directory: {result['output_dir']}")

        # Access the different formats
        print("\n--- Available Outputs ---")
        print(f"Plain text length: {len(result['text'])}")
        if result["markdown"]:
            print(f"Markdown length: {len(result['markdown'])}")
        if result["html"]:
            print(f"HTML length: {len(result['html'])}")
    else:
        print("✗ Extraction failed")


def example_summarization():
    """Example: Summarize PDF content for video narration"""
    print("\n" + "=" * 60)
    print("Example 3: Content Summarization for Video")
    print("=" * 60)

    pdf_path = "path/to/your/paper.pdf"

    # Extract text
    text, _ = extract_text_from_pdf(pdf_path)

    if text:
        print(f"Original text: {len(text):,} characters")

        # Summarize for 2-minute video
        summary = summarize_pdf_content(text, max_length=2000)

        print(f"Summarized text: {len(summary):,} characters")
        print(f"Reduction: {(1 - len(summary)/len(text))*100:.1f}%")

        print("\n--- Summarized Content ---")
        print(summary)
    else:
        print("✗ Failed to extract text")


def example_process_paper():
    """Example: Process paper with backward compatibility"""
    print("\n" + "=" * 60)
    print("Example 4: Process Paper (Compatible with Existing Code)")
    print("=" * 60)

    pdf_path = "path/to/your/paper.pdf"
    paper_id = "test_paper_001"

    # Process PDF (uses OpenDataLoader with PyMuPDF fallback)
    result = process_pdf_file(pdf_path, paper_id)

    if result:
        print("✓ Paper processed successfully")
        print(f"✓ Metadata: {result['metadata']}")
        print(f"✓ Text file: {result['text_file_path']}")
        print(f"✓ Source directory: {result['source_dir']}")
        print(f"✓ Images extracted: {len(result['image_files'])}")
        print(f"✓ Status: {result['status']}")

        # New fields added with OpenDataLoader
        if "structured_data" in result:
            print(
                f"✓ Structured data available: {result['structured_data'] is not None}"
            )
        if "markdown" in result:
            print(f"✓ Markdown available: {result['markdown'] is not None}")
        if "annotated_pdf_path" in result:
            print(f"✓ Annotated PDF: {result['annotated_pdf_path']}")
    else:
        print("✗ Processing failed")


def example_arxiv_integration():
    """Example: Integration with arXiv download"""
    print("\n" + "=" * 60)
    print("Example 5: arXiv Paper Processing")
    print("=" * 60)

    # Simulating arXiv download
    arxiv_id = "2301.12345"
    pdf_path = f"temp/arxiv_{arxiv_id}.pdf"

    print(f"Processing arXiv paper: {arxiv_id}")

    # Extract with features
    result = extract_with_full_features(
        pdf_path, generate_markdown=True, generate_annotated_pdf=True
    )

    if result and result.get("text"):
        # Summarize for video
        summary = summarize_pdf_content(result["text"])

        print(f"✓ Paper extracted and summarized")
        print(f"✓ Full text: {len(result['text']):,} characters")
        print(f"✓ Summary: {len(summary):,} characters")
        print(f"✓ Suitable for ~2 minute video")

        # Show statistics
        words = len(summary.split())
        estimated_time = words / 150  # 150 words per minute
        print(f"✓ Estimated narration time: {estimated_time:.1f} minutes")
    else:
        print("✗ Failed to process arXiv paper")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("OpenDataLoader PDF Processor - Usage Examples")
    print("=" * 60)

    print("\nNote: Update the pdf_path variables with actual PDF files")
    print("to run these examples.\n")

    # Uncomment to run examples:
    # example_basic_extraction()
    # example_full_features()
    # example_summarization()
    # example_process_paper()
    # example_arxiv_integration()

    print("\n" + "=" * 60)
    print("Examples Complete")
    print("=" * 60)
