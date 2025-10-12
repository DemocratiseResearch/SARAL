# Whiteboard Video Generator

A comprehensive whiteboard-style video generation system with hand-drawing animations, supporting multiple AI image generation services.

## 🎨 Features

### Core Capabilities

- **Hand-Drawing Animation**: Realistic hand-drawing effect using OpenCV
- **Multi-Scene Support**: Automatically breaks content into visual scenes
- **Audio Synchronization**: Perfect sync with narration and subtitles
- **Multiple Image Models**: Choose from Pollinations (free), Gemini, or Stable Diffusion

### Image Generation Options

#### 1. **Pollinations AI** (Default - Free!)

- ✅ **No API key required**
- ✅ Completely free
- ✅ Good quality for educational content
- ⚠️ Service availability may vary

#### 2. **Gemini 2.0 Flash**

- ✅ High quality images
- ✅ Fast generation
- 🔑 Requires GEMINI_API_KEY
- 💰 Free tier available

#### 3. **Stable Diffusion 1.5**

- ✅ Works offline
- ✅ Consistent quality
- 🖥️ Requires GPU (CUDA)
- 💾 ~4GB VRAM needed

## 📋 API Endpoints

### Preview Script

```http
POST /api/whiteboard/preview/{paper_id}
```

**Request Body:**

```json
{
  "target_duration": 60.0  // Optional: target video duration in seconds
}
```

**Response:**

```json
{
  "success": true,
  "narration_script": "Full narration text...",
  "scenes": [
    {
      "scene_number": 1,
      "start_time": 0.0,
      "duration": 10.5,
      "image_prompt": "Neural network diagram with nodes",
      "narration": "Machine learning uses neural networks..."
    }
  ],
  "total_duration": 63.5,
  "word_count": 420,
  "message": "Preview ready: 6 scenes, 63.5s"
}
```

### Generate Video

```http
POST /api/whiteboard/generate/{paper_id}
```

**Request Body:**

```json
{
  "paper_id": "paper_123",
  "image_model": "pollinations",  // "pollinations", "gemini", or "sd"
  "scenes_count": null  // Optional: fixed number of scenes
}
```

**Response:**

```json
{
  "success": true,
  "video_path": "/temp/videos/whiteboard_paper_123.mp4",
  "narration": "Full narration script...",
  "scenes_count": 6,
  "message": "Whiteboard video generated successfully with 6 scenes"
}
```

### Download Video

```http
GET /api/whiteboard/download/{paper_id}
```

Returns the generated MP4 video file.

### Check Status

```http
GET /api/whiteboard/status/{paper_id}
```

**Response:**

```json
{
  "exists": true,
  "has_video": true,
  "scenes_count": 6,
  "image_model": "gemini",
  "message": "Whiteboard video available"
}
```

### Delete Video

```http
DELETE /api/whiteboard/{paper_id}
```

## 🚀 Quick Start

### Backend Setup

1. **Install Dependencies**

```bash
cd backend
pip install -r requirements.txt
```

2. **Set Environment Variables**

```bash
# Required for Gemini image generation
export GEMINI_API_KEY="your-gemini-api-key"

# Optional: for other services
export OPENAI_API_KEY="your-openai-key"
```

3. **Start Server**

```bash
uvicorn app.main:app --reload --port 8000
```

### Using Different Image Models

#### Pollinations AI (Default - No Setup Required)

```python
{
  "image_model": "pollinations"
}
```

#### Gemini Image

```python
# Set environment variable
export GEMINI_API_KEY="your-key-here"

# Request body
{
  "image_model": "gemini"
}
```

#### Stable Diffusion

```python
# Ensure CUDA is available
# Request body
{
  "image_model": "sd"
}
```

## 📁 File Structure

```
backend/
├── app/
│   ├── services/
│   │   ├── whiteboard_service.py       # Main whiteboard animation
│   │   ├── script_planner.py           # Scene planning with AI
│   │   ├── pollinations_service.py     # Free image generation
│   │   ├── gemini_image_service.py     # Gemini image generation
│   │   └── tts_service.py              # Audio generation
│   │
│   ├── routes/
│   │   └── whiteboard.py               # API routes
│   │
│   └── images/                          # Hand assets (create this)
│       ├── drawing-hand.png
│       └── hand-mask.png
│
└── requirements.txt
```

## 🎬 How It Works

### 1. Script Planning

```python
from app.services.script_planner import create_video_script

# Analyzes narration and creates visual scenes
video_script = create_video_script(
    narration="Your narration text...",
    subtitle_file="path/to/subtitles.ass",  # For precise timing
    target_duration=60.0
)
```

### 2. Image Generation

```python
from app.services.whiteboard_service import generate_image

# Generates educational-style images
for segment in video_script.segments:
    image_path = generate_image(
        segment,
        image_model="pollinations"  # or "gemini", "sd"
    )
```

### 3. Animation Creation

```python
from app.services.whiteboard_service import create_whiteboard_animation

# Creates hand-drawing animation
video_path = create_whiteboard_animation(
    video_script=video_script,
    audio_file="narration.mp3",
    subtitle_file="subtitles.ass",
    image_model="pollinations"
)
```

## ⚙️ Configuration

### Drawing Parameters

In `whiteboard_service.py`:

```python
# Grid size for drawing (smaller = more detailed)
split_len = 14

# Skip rate (higher = faster drawing)
skip_rate = 10

# Time allocation
drawing_time_ratio = 0.40  # 40% drawing
hold_time_ratio = 0.60      # 60% displaying
```

### Scene Count

Auto-calculated based on duration, or specify:

```python
{
  "scenes_count": 6  # Fixed number of scenes
}
```

## 🎨 Hand Assets

Create or obtain hand images and place in `backend/app/images/`:

- `drawing-hand.png` - Hand with pen/marker
- `hand-mask.png` - Alpha mask for transparency

**Requirements:**

- PNG format with transparency
- Recommended size: 200x200px
- Clean edges for proper masking

## 🔧 Troubleshooting

### Pollinations 502 Error

```
Error: Pollinations AI is currently unavailable (502)
```

**Solution:** Switch to Gemini or Stable Diffusion:

```json
{
  "image_model": "gemini"  // or "sd"
}
```

### Gemini API Error

```
Error: GEMINI_API_KEY is required
```

**Solution:** Get free API key:

1. Visit <https://aistudio.google.com/app/apikey>
2. Create new API key
3. Set environment variable:

```bash
export GEMINI_API_KEY="your-key"
```

### CUDA Not Available (Stable Diffusion)

```
Error: CUDA is not available
```

**Solution:** Use Pollinations or Gemini instead, or install CUDA toolkit.

### Hand Assets Missing

```
Warning: Hand assets not found
```

**Solution:** Create `backend/app/images/` directory and add hand images. Video will still generate without hand overlay.

## 📊 Performance

### Image Generation Speed

- **Pollinations**: ~5-10s per image (depends on service load)
- **Gemini**: ~3-5s per image
- **Stable Diffusion**: ~2-3s per image (with GPU)

### Video Generation Time

For a 60-second video with 6 scenes:

- Image generation: 30-60 seconds
- Animation creation: 20-30 seconds
- Audio merging: 5-10 seconds
- **Total: ~1-2 minutes**

## 🎯 Best Practices

### 1. Scene Count

- **Short videos (<30s)**: 3-4 scenes
- **Medium videos (30-90s)**: 5-8 scenes
- **Long videos (>90s)**: 8-12 scenes

### 2. Image Model Selection

- **Pollinations**: Best for quick prototypes, free tier
- **Gemini**: Best quality-to-speed ratio
- **Stable Diffusion**: Best for offline/privacy needs

### 3. Preview First

Always preview the script before generating:

```python
# 1. Preview
response = await preview_whiteboard_script(...)

# 2. Review scenes
for scene in response.scenes:
    print(f"Scene {scene.scene_number}: {scene.image_prompt}")

# 3. Generate
response = await generate_whiteboard_video(...)
```

## 🔗 Integration Example

### Complete Workflow

```python
import requests

API_BASE = "http://localhost:8000/api"
paper_id = "paper_123"

# 1. Preview script
preview = requests.post(
    f"{API_BASE}/whiteboard/preview/{paper_id}",
    json={"target_duration": 60.0}
)
print(f"Scenes: {len(preview.json()['scenes'])}")

# 2. Generate video
generate = requests.post(
    f"{API_BASE}/whiteboard/generate/{paper_id}",
    json={"image_model": "pollinations"}
)

# 3. Download video
video = requests.get(
    f"{API_BASE}/whiteboard/download/{paper_id}"
)

with open("output.mp4", "wb") as f:
    f.write(video.content)

print("✅ Video saved to output.mp4")
```

## 📝 TODO / Future Enhancements

- [ ] Add more image generation models (DALL-E, Midjourney)
- [ ] Support custom hand assets upload
- [ ] Add color customization (background, line colors)
- [ ] Parallel image generation for faster processing
- [ ] Cache generated images for reuse
- [ ] Add animation style options (sketch, marker, crayon)
- [ ] Support for mathematical equations rendering
- [ ] Real-time progress updates via WebSocket

## 🐛 Known Issues

1. **Pollinations service intermittent availability** - Use Gemini as backup
2. **Large videos (>5 min) may timeout** - Split into smaller segments
3. **Hand overlay position may need adjustment** - Configurable in future updates

## 📄 License

MIT License - See main project LICENSE file

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

---

**Questions?** Open an issue on GitHub or check the API documentation at `/docs`
