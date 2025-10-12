# PDF Processor Implementation with OpenDataLoader

## Overview

Enhanced the `pdf_processor.py` service with OpenDataLoader integration for advanced PDF text extraction and processing.

## New Features Added

### 1. **extract_text_from_pdf()**

- Extracts structured text from PDF using OpenDataLoader
- Returns both plain text and structured JSON data
- Uses markdown format for clean text extraction
- Includes fallback to JSON structure if markdown fails

### 2. **extract_text_from_json()**

- Recursively extracts text content from OpenDataLoader JSON structure
- Traverses nested structures (kids, content fields)
- Handles complex document layouts

### 3. **extract_with_full_features()**

- Comprehensive PDF extraction with all OpenDataLoader capabilities
- Generates multiple output formats:
  - JSON (structured data)
  - Markdown (clean text)
  - HTML (optional)
  - Annotated PDF (highlights layout elements)
- Configurable output directory
- Returns dictionary with all extracted content and file paths

### 4. **summarize_pdf_content()**

- Summarizes or truncates PDF content for video narration
- Targets ~2 minute narration (300-400 words, ~2000 characters)
- Filters out credit/acknowledgment sections
- Smart truncation at sentence or paragraph boundaries

### 5. **Enhanced process_pdf_file()**

- Updated to use OpenDataLoader as primary extraction method
- Falls back to PyMuPDF if OpenDataLoader fails
- Returns additional data:
  - `structured_data`: Full JSON structure from OpenDataLoader
  - `markdown`: Markdown formatted text
  - `annotated_pdf_path`: Path to annotated PDF with layout highlighting
- Maintains backward compatibility with existing API

## Key Benefits

1. **Better Text Extraction**: OpenDataLoader provides more accurate text extraction compared to basic PyMuPDF
2. **Layout Preservation**: Understands document structure (headings, paragraphs, lists, etc.)
3. **Multiple Formats**: Generates JSON, Markdown, HTML, and annotated PDFs
4. **Visual Debugging**: Annotated PDFs help understand how the tool interprets layout
5. **Robust Fallback**: Automatically falls back to PyMuPDF if OpenDataLoader fails

## Usage Example

```python
from services.pdf_processor import extract_with_full_features, summarize_pdf_content

# Extract with full features
result = extract_with_full_features(
    pdf_path="paper.pdf",
    generate_markdown=True,
    generate_html=False,
    generate_annotated_pdf=True
)

# Access extracted content
text = result["text"]
structured_data = result["structured_data"]
markdown = result["markdown"]
annotated_pdf = result["annotated_pdf_path"]

# Summarize for narration
summary = summarize_pdf_content(text, max_length=2000)
```

## Integration with Existing Code

The `process_pdf_file()` function has been updated to:

1. Try OpenDataLoader first for better extraction
2. Fall back to PyMuPDF if needed
3. Return all the same fields as before (backward compatible)
4. Add new fields for enhanced features

Existing code using `process_pdf_file()` will continue to work without changes.

## Dependencies Added

- `opendataloader_pdf` - Added to requirements.txt

## Files Modified

1. `/backend/app/services/pdf_processor.py` - Main implementation
2. `/backend/requirements.txt` - Added opendataloader_pdf dependency

## Example Integration for Streamlit UI

The implementation includes a PDFLoader class pattern that can be adapted:

```python
from services.pdf_processor import extract_with_full_features

# In your Streamlit app
result = extract_with_full_features(
    pdf_path,
    generate_markdown=True,
    generate_html=False,
    generate_annotated_pdf=True
)

if result and result.get("text"):
    st.success(f"✅ Extracted {len(result['text']):,} characters")
    # Use result["text"] for video generation
    # Use result["annotated_pdf_path"] for visual debugging
```

## Notes

- OpenDataLoader is more accurate but may be slower than PyMuPDF
- Annotated PDFs are useful for debugging extraction issues
- The summarize function is optimized for 2-minute videos
- All temporary files are properly cleaned up using context managers
