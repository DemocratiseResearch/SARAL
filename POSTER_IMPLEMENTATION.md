# Paper-to-Poster Implementation

A simplified implementation of academic poster generation inspired by [Paper2Poster](https://github.com/Paper2Poster/Paper2Poster), integrated into the Saral AI platform.

## Overview

This implementation provides a streamlined workflow to transform research papers into professional academic posters using AI-powered content extraction, layout optimization, and HTML rendering.

## Features

- **PDF Upload**: Upload research papers directly or use existing papers from the system
- **AI-Powered Content Extraction**: Uses OpenDataLoader PDF for structured content extraction
- **Intelligent Layout Generation**: Gemini AI generates optimized poster layouts based on paper content
- **Configurable Dimensions**: Customize poster size (default: 48" × 36")
- **Multiple Styles**: Choose from Academic, Modern, or Minimal themes
- **Progress Tracking**: Real-time status updates during poster generation
- **HTML Output**: Download poster as HTML file for easy viewing and sharing

## Architecture

### Backend Components

1. **`poster_service.py`**: Core poster generation service
   - Content extraction from PDFs using `pdf_processor.py`
   - Section parsing and structure analysis
   - Figure and table extraction
   - AI-powered outline generation via Gemini
   - Content optimization and bullet point generation
   - HTML poster rendering

2. **`routes/posters.py`**: API endpoints
   - `POST /api/posters/upload`: Upload PDF and generate poster
   - `POST /api/posters/generate-from-paper`: Generate from existing paper
   - `GET /api/posters/status/{poster_id}`: Check generation status
   - `GET /api/posters/download/{poster_id}/html`: Download poster HTML
   - `GET /api/posters/list`: List user's posters
   - `DELETE /api/posters/{poster_id}`: Delete a poster

### Frontend Components

1. **`PosterGeneration.jsx`**: Main poster generation page
   - Dual input mode: file upload or existing paper
   - Configuration panel for dimensions and style
   - Real-time progress tracking with polling
   - Poster list with download and delete options

2. **Integration Points**:
   - Added to `App.js` routing (`/poster-generation`)
   - Navigation link in `Sidebar.jsx`
   - Feature card on `LandingPage.jsx`
   - API service methods in `services/api.js`

## Implementation Differences from Paper2Poster

While inspired by Paper2Poster, this implementation is significantly simplified:

### What We Kept:
- Core concept of extracting content from papers
- Multi-section poster layout
- AI-powered content generation
- Structured outline approach

### What We Simplified:
- **No Multi-Agent System**: Uses single Gemini API calls instead of CAMEL framework
- **No Layout Optimization**: Uses simple grid-based layout instead of tree-split algorithm
- **No Visual Feedback Loop**: No iterative refinement with VLM
- **HTML Instead of PPTX**: Generates HTML posters instead of PowerPoint
- **No Logo Search**: Simplified to focus on core content
- **No Theme Application**: Basic color schemes instead of advanced styling

## Workflow

1. **User uploads PDF or selects existing paper**
2. **Content Extraction** (`extract_paper_content`):
   - Uses `pdf_processor.py` with OpenDataLoader
   - Extracts text, sections, figures, and tables
   - Parses content into structured format

3. **Outline Generation** (`generate_poster_outline`):
   - Sends paper content to Gemini
   - AI generates optimal poster structure
   - Defines sections, positions, and content types

4. **Content Generation** (`generate_poster_content`):
   - For each section, generates concise bullet points
   - Optimizes content length for poster format
   - Identifies relevant figures/tables

5. **HTML Rendering** (`create_poster_html`):
   - Generates responsive HTML with CSS grid
   - Applies color scheme and styling
   - Creates downloadable HTML file

6. **Background Processing**:
   - All generation happens asynchronously
   - Status updates via polling endpoint
   - User can continue using app while generating

## Usage Example

### Frontend:
```javascript
// Upload PDF and generate poster
const formData = new FormData();
formData.append('file', pdfFile);
formData.append('width', 48);
formData.append('height', 36);
formData.append('style', 'academic');

const response = await apiService.uploadAndGeneratePoster(formData);
const posterId = response.data.poster_id;

// Check status
const status = await apiService.getPosterStatus(posterId);

// Download when ready
if (status.data.status === 'completed') {
  await apiService.downloadPosterHTML(posterId);
}
```

### Backend API:
```python
# Generate poster from service
poster_service = get_poster_service(gemini_api_key)
result = await poster_service.generate_poster(
    pdf_path="path/to/paper.pdf",
    config={
        "width": 48,
        "height": 36,
        "style": "academic"
    }
)
# Returns: poster_id, html_path, metadata
```

## Configuration

### Poster Dimensions
- Default: 48" × 36" (landscape)
- Customizable via frontend UI
- Common sizes: 36×24, 42×32, 48×36

### Styles
- **Academic**: Traditional blue/gold color scheme
- **Modern**: Contemporary design (future)
- **Minimal**: Clean, simple layout (future)

## File Structure

```
backend/
  app/
    services/
      poster_service.py       # Core poster generation logic
      pdf_processor.py        # PDF extraction (existing)
      saras_service.py        # Content analysis (existing)
    routes/
      posters.py              # API endpoints
  temp/
    posters/                  # Generated poster storage
      uploads/                # Uploaded PDFs
      {poster_id}/           # Individual poster outputs
        poster.html          # Generated HTML
        metadata.json        # Poster metadata

frontend/
  src/
    pages/
      PosterGeneration.jsx   # Main poster page
    services/
      api.js                 # API methods (extended)
```

## Dependencies

### Backend (already installed):
- `google-genai`: For Gemini API
- `opendataloader-pdf`: For PDF extraction
- `fastapi`: For API endpoints
- `pydantic`: For request/response models

### Frontend (already installed):
- `react`: UI framework
- `react-router-dom`: Routing
- `axios`: HTTP client
- `react-hot-toast`: Notifications

## Future Enhancements

1. **PDF Export**: Convert HTML posters to PDF
2. **Image Embedding**: Include actual figures from papers
3. **Advanced Layouts**: Implement tree-split algorithm
4. **Template System**: Multiple poster templates
5. **Collaboration**: Share posters with colleagues
6. **Print Ready**: Ensure print quality and bleeds
7. **QR Codes**: Add QR codes linking to paper
8. **Analytics**: Track poster views/downloads

## Comparison with Full Paper2Poster

| Feature | Our Implementation | Paper2Poster |
|---------|-------------------|--------------|
| Content Extraction | ✅ OpenDataLoader | ✅ Docling |
| AI Generation | ✅ Gemini Single Call | ✅ Multi-Agent (CAMEL) |
| Layout Algorithm | ⚠️ Simple Grid | ✅ Tree-Split + Optimization |
| Visual Feedback | ❌ Not implemented | ✅ VLM Critique Loop |
| Output Format | ✅ HTML | ✅ PPTX |
| Figure Handling | ⚠️ Placeholders | ✅ Full Integration |
| Customization | ⚠️ Basic | ✅ YAML + Themes |
| Complexity | Low (500 lines) | High (5000+ lines) |

## Notes

- This is a **simplified** implementation focused on core functionality
- Designed to integrate seamlessly with existing Saral AI workflows
- Uses existing services (`pdf_processor`, `saras_service`) where possible
- Prioritizes user experience and quick results over perfect layout
- HTML output allows for easy viewing in any browser
- Background processing prevents UI blocking

## Credits

Inspired by [Paper2Poster](https://github.com/Paper2Poster/Paper2Poster) by Wei Pang, Kevin Qinghong Lin, and Xiangru Jian (NeurIPS 2025).

This implementation simplifies the original approach for integration into the Saral AI platform while maintaining the core concept of AI-powered academic poster generation.
