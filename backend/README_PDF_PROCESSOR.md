# OpenDataLoader PDF Processor Implementation

This implementation enhances the PDF processing capabilities of the Saral project using OpenDataLoader for advanced text extraction and document understanding.

## 🚀 Features

### 1. Advanced Text Extraction

- **OpenDataLoader Integration**: State-of-the-art PDF text extraction
- **Layout-Aware**: Understands document structure (headings, paragraphs, lists)
- **Multiple Formats**: JSON, Markdown, HTML, and annotated PDFs
- **Fallback Support**: Automatically falls back to PyMuPDF if needed

### 2. Document Understanding

- **Structured Data**: JSON representation of document layout
- **Semantic Extraction**: Preserves document hierarchy and relationships
- **Visual Debugging**: Annotated PDFs show how layout is interpreted

### 3. Content Optimization

- **Smart Summarization**: Optimized for video narration
- **Credit Filtering**: Removes acknowledgment sections
- **Intelligent Truncation**: Cuts at sentence/paragraph boundaries

## 📋 Functions

### `extract_text_from_pdf(pdf_path: str)`

Extracts structured text from PDF using OpenDataLoader.

**Returns:** `Tuple[Optional[str], Optional[dict]]`

- `extracted_text`: Clean text suitable for narration
- `structured_data`: Full JSON structure with layout information

**Example:**

```python
text, structured = extract_text_from_pdf("paper.pdf")
print(f"Extracted {len(text)} characters")
```

---

### `extract_text_from_json(json_data: dict)`

Recursively extracts text from OpenDataLoader JSON structure.

**Parameters:**

- `json_data`: The JSON structure from OpenDataLoader

**Returns:** `str` - Concatenated text content

---

### `extract_with_full_features(pdf_path, generate_markdown, generate_html, generate_annotated_pdf, output_dir)`

Comprehensive PDF extraction with all OpenDataLoader features.

**Parameters:**

- `pdf_path` (str): Path to PDF file
- `generate_markdown` (bool): Generate markdown output (default: True)
- `generate_html` (bool): Generate HTML output (default: False)
- `generate_annotated_pdf` (bool): Generate annotated PDF (default: True)
- `output_dir` (str): Custom output directory (optional)

**Returns:** `Dict[str, Any]` with keys:

- `text`: Extracted plain text
- `structured_data`: JSON structure
- `markdown`: Markdown formatted text
- `html`: HTML formatted text
- `annotated_pdf_path`: Path to annotated PDF
- `output_dir`: Output directory path
- `json_path`: Path to JSON file
- `markdown_path`: Path to markdown file
- `html_path`: Path to HTML file

**Example:**

```python
result = extract_with_full_features(
    "paper.pdf",
    generate_markdown=True,
    generate_annotated_pdf=True
)

print(f"Text: {len(result['text'])} chars")
print(f"Annotated PDF: {result['annotated_pdf_path']}")
```

---

### `summarize_pdf_content(text: str, max_length: int)`

Summarizes PDF content for video narration.

**Parameters:**

- `text` (str): Full extracted text
- `max_length` (int): Maximum character length (default: 2000)

**Returns:** `str` - Summarized text (~2 minute narration)

**Example:**

```python
summary = summarize_pdf_content(text, max_length=2000)
words = len(summary.split())
time = words / 150  # 150 words per minute
print(f"Narration time: {time:.1f} minutes")
```

---

### `process_pdf_file(pdf_path: str, paper_id: str)`

**Enhanced** - Now uses OpenDataLoader with PyMuPDF fallback.

**Parameters:**

- `pdf_path` (str): Path to PDF file
- `paper_id` (str): Unique identifier for the paper

**Returns:** `Dict` with keys:

- `metadata`: Paper metadata (title, authors, date)
- `text_file_path`: Path to extracted text file
- `tex_file_path`: Path to tex file (same as text_file_path)
- `source_dir`: Source directory path
- `image_files`: List of extracted image paths
- `pdf_path`: Path to copied PDF
- `status`: Processing status
- **NEW** `structured_data`: JSON structure (if OpenDataLoader succeeds)
- **NEW** `markdown`: Markdown text (if OpenDataLoader succeeds)
- **NEW** `annotated_pdf_path`: Annotated PDF path (if generated)

**Example:**

```python
result = process_pdf_file("paper.pdf", "paper_001")
print(f"Status: {result['status']}")
print(f"Images: {len(result['image_files'])}")
if 'annotated_pdf_path' in result:
    print(f"Annotated: {result['annotated_pdf_path']}")
```

## 🔧 Installation

Add to your `requirements.txt`:

```
opendataloader_pdf
```

Install:

```bash
pip install opendataloader_pdf
```

## 📖 Usage Examples

### Basic Extraction

```python
from services.pdf_processor import extract_text_from_pdf

text, structured = extract_text_from_pdf("research_paper.pdf")
print(text[:500])  # First 500 characters
```

### Full Feature Extraction

```python
from services.pdf_processor import extract_with_full_features

result = extract_with_full_features(
    "research_paper.pdf",
    generate_markdown=True,
    generate_annotated_pdf=True,
    output_dir="output/pdf_analysis"
)

# Access different formats
print(f"Plain text: {result['text']}")
print(f"Markdown file: {result['markdown_path']}")
print(f"Annotated PDF: {result['annotated_pdf_path']}")
```

### Video Narration Preparation

```python
from services.pdf_processor import extract_text_from_pdf, summarize_pdf_content

# Extract full text
text, _ = extract_text_from_pdf("paper.pdf")

# Summarize for 2-minute video
summary = summarize_pdf_content(text, max_length=2000)

# Use summary for TTS
print(f"Narration text: {summary}")
```

### arXiv Integration

```python
import requests
from services.pdf_processor import extract_with_full_features, summarize_pdf_content

# Download arXiv paper
arxiv_id = "2301.12345"
pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
response = requests.get(pdf_url)

# Save and process
with open(f"temp/{arxiv_id}.pdf", "wb") as f:
    f.write(response.content)

# Extract and summarize
result = extract_with_full_features(f"temp/{arxiv_id}.pdf")
summary = summarize_pdf_content(result["text"])

print(f"Ready for video generation: {len(summary)} characters")
```

## 🎯 Use Cases

### 1. Research Paper to Video Pipeline

```python
# Complete pipeline
text, _ = extract_text_from_pdf("paper.pdf")
summary = summarize_pdf_content(text)
# Pass summary to TTS and video generation
```

### 2. Document Analysis

```python
# Analyze structure
result = extract_with_full_features("document.pdf")
structured = result["structured_data"]
# Analyze document hierarchy
```

### 3. Visual Debugging

```python
# Generate annotated PDF to debug extraction
result = extract_with_full_features(
    "problematic.pdf",
    generate_annotated_pdf=True
)
# Review annotated_pdf_path to see layout interpretation
```

## ⚡ Performance

- **Speed**: OpenDataLoader is slower but more accurate than PyMuPDF
- **Fallback**: Automatic fallback ensures reliability
- **Memory**: Temporary files cleaned up automatically
- **Accuracy**: Significantly better text extraction for complex layouts

## 🔄 Backward Compatibility

The enhanced `process_pdf_file()` function maintains full backward compatibility:

**Before:**

```python
result = process_pdf_file("paper.pdf", "paper_001")
# Returns: metadata, text_file_path, source_dir, image_files, pdf_path, status
```

**After:**

```python
result = process_pdf_file("paper.pdf", "paper_001")
# Returns same fields PLUS:
# - structured_data (new)
# - markdown (new)
# - annotated_pdf_path (new)
```

Existing code continues to work without modifications.

## 🐛 Troubleshooting

### Issue: OpenDataLoader import error

**Solution:** Install opendataloader_pdf

```bash
pip install opendataloader_pdf
```

### Issue: Extraction fails

**Solution:** The code automatically falls back to PyMuPDF. Check logs for details.

### Issue: Annotated PDF not generated

**Solution:** This is optional. Check if `generate_annotated_pdf=True` and review logs.

### Issue: Text too long for video

**Solution:** Use `summarize_pdf_content()` to truncate intelligently:

```python
summary = summarize_pdf_content(text, max_length=2000)
```

## 📁 File Structure

```
backend/
├── app/
│   └── services/
│       ├── pdf_processor.py              # Main implementation
│       └── PDF_PROCESSOR_IMPLEMENTATION.md  # Detailed docs
├── examples/
│   └── pdf_processor_usage.py            # Usage examples
└── requirements.txt                       # Dependencies
```

## 🧪 Testing

See `examples/pdf_processor_usage.py` for comprehensive test cases:

```bash
cd backend
python examples/pdf_processor_usage.py
```

## 📝 Notes

1. **Temporary Files**: All temporary files are cleaned up using context managers
2. **Error Handling**: Comprehensive error handling with fallback mechanisms
3. **Logging**: Detailed logging for debugging (check logs for extraction details)
4. **Type Hints**: Full type hint support for better IDE integration

## 🤝 Integration Points

This implementation integrates with:

- **arXiv Scraper**: Process downloaded papers
- **Script Generator**: Provide text for script generation
- **TTS Service**: Generate narration from summarized text
- **Video Service**: Complete video generation pipeline

## 📚 Additional Resources

- OpenDataLoader Documentation: [Link to docs if available]
- PyMuPDF Documentation: <https://pymupdf.readthedocs.io/>
- Usage Examples: `backend/examples/pdf_processor_usage.py`
- Implementation Details: `backend/app/services/PDF_PROCESSOR_IMPLEMENTATION.md`

## ✨ Future Enhancements

Potential improvements:

- [ ] Parallel processing for multiple PDFs
- [ ] Custom summarization strategies
- [ ] Table extraction and formatting
- [ ] Figure caption extraction
- [ ] Citation extraction and linking
- [ ] Multi-language support

---

**Version**: 1.0.0  
**Last Updated**: 2025-10-11  
**Maintainer**: Saral Development Team
