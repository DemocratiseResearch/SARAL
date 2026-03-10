# SARAL — Paper to Video

**SARAL** converts research papers (arXiv, LaTeX ZIP, or PDF) into narrated video presentations with multi-language support for 11 Indian languages.

## Features

- **Multi-source input** — arXiv URL, LaTeX ZIP upload, or PDF upload
- **AI-generated scripts** — 5-section presentation scripts (Intro, Methodology, Results, Discussion, Conclusion) with bullet points
- **Model-agnostic LLM** — any provider via LiteLLM: Gemini, OpenAI, Anthropic, Groq, Ollama, Mistral, and [100+ more](https://docs.litellm.ai/docs/providers)
- **Slide generation** — python-pptx (no LaTeX/pdflatex required)
- **11-language TTS** — Sarvam AI: English, Hindi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi
- **Video composition** — MoviePy + ffmpeg
- **Firebase Auth** — Google sign-in
- **Encrypted API key storage** — Fernet encryption at rest

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- ffmpeg (`brew install ffmpeg` / `apt install ffmpeg`)
- LibreOffice (optional, for high-quality PPTX → image conversion)
- A Firebase project with Google sign-in enabled

### 1. Clone & configure

```bash
git clone https://github.com/yourusername/SARAL.git
cd SARAL
cp .env.example .env
# Fill in your API keys and Firebase config in .env
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend starts at `http://localhost:8000`. On first run it creates a `saral.db` SQLite database.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:3000`.

### 4. Generate an encryption key

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Paste the output into `ENCRYPTION_KEY` in your `.env`.

### 5. Base64-encode your Firebase service account

```bash
base64 -i path/to/firebase-service-account.json
```

Paste the output into `FIREBASE_SERVICE_ACCOUNT_BASE64` in your `.env`.

## Architecture

```
backend/
  app/
    main.py            # FastAPI app factory + CORS + lifespan
    config.py          # pydantic-settings (env vars)
    database.py        # SQLModel engine + session
    auth/              # Firebase Admin SDK verification
    models/            # SQLModel tables (User, Paper, Script, Slide, Media, ApiKey, Job)
    schemas/           # Pydantic request/response models
    providers/         # LLM calls (LiteLLM — model-agnostic)
    services/          # Business logic orchestration
    routes/            # FastAPI routers
    utils/             # PDF, arXiv, LaTeX, TTS, slides (pptx), video, encryption

frontend/
  src/
    routes/            # TanStack file-based routing
    components/        # React components (UI + workflow)
    stores/            # Zustand state (auth, workflow)
    lib/               # API client (Axios + interceptors), Firebase, utils
```

## API Endpoints

| Method | Path                             | Description                        |
| ------ | -------------------------------- | ---------------------------------- |
| POST   | `/api/auth/google-login`         | Verify Firebase token, upsert user |
| GET    | `/api/auth/me`                   | Get current user                   |
| POST   | `/api/api-keys`                  | Save encrypted API keys            |
| GET    | `/api/api-keys/status`           | Check which keys are configured    |
| POST   | `/api/papers/scrape-arxiv`       | Fetch paper from arXiv             |
| POST   | `/api/papers/upload-zip`         | Upload LaTeX ZIP                   |
| POST   | `/api/papers/upload-pdf`         | Upload PDF                         |
| GET    | `/api/papers`                    | List user's papers                 |
| POST   | `/api/scripts/{id}/generate`     | Generate presentation scripts      |
| GET    | `/api/scripts/{id}`              | Get scripts for a paper            |
| POST   | `/api/slides/{id}/generate`      | Generate PPTX + slide images       |
| POST   | `/api/media/{id}/generate-audio` | Generate TTS audio                 |
| POST   | `/api/media/{id}/generate-video` | Compose final video                |
| GET    | `/api/media/{id}/video`          | Stream video                       |
| GET    | `/api/health`                    | Health check                       |

## Tech Stack

| Layer    | Technology                                                               |
| -------- | ------------------------------------------------------------------------ |
| Backend  | FastAPI, SQLModel, SQLite, Firebase Admin SDK                            |
| Frontend | TanStack Start, React 19, TypeScript, Tailwind CSS, Zustand              |
| LLM      | Any provider via LiteLLM (Gemini, OpenAI, Anthropic, Groq, Ollama, etc.) |
| TTS      | Sarvam AI                                                                |
| Slides   | python-pptx                                                              |
| Video    | MoviePy + ffmpeg                                                         |
| Auth     | Firebase (Google)                                                        |

## License

MIT
