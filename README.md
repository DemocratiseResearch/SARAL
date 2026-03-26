# SARAL: Simplified And Automated Research Amplification and Learning

SARAL AI is a full-stack application that automates the process of converting research papers (LaTeX or arXiv) into engaging educational videos. The system leverages AI for script generation, slide creation, audio narration, and video synthesis, providing a seamless workflow from paper upload to downloadable media.This guide covers the full local setup for the SARAL monorepo, which contains both the frontend (React + Vite) and backend (Python + FastAPI) in a single repository.

```
saral/
├── frontend/        # React + Vite app
└── backend/         # FastAPI + worker services
```

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Setup](#repository-setup)
- [Backend Setup](#backend-setup)
- [Poster Generation Go Service](#7-poster-generation-go-service-required-for-poster-generation)
- [Frontend Setup](#frontend-setup)
- [Running the Full Stack](#running-the-full-stack)
- [Troubleshooting](#troubleshooting)
- [Notes for Contributors](#notes-for-contributors)

---

## Prerequisites

Before anything else, make sure you have these installed:

- **Git**
- **Node.js** (active LTS, minimum Node 18+) — comes bundled with `npm`
- **Python 3.11.x** — required by `backend/pyproject.toml`
- **Go** (recommended 1.22+) — required for poster generation service in `poster-service/`
- **A modern browser** (Google Chrome recommended)

Quick version checks:

```bash
node --version
npm --version
python3.11 --version
go version
git --version
```

---

## Repository Setup

```bash
git clone <your-repository-url>
cd saral
```

---

## Backend Setup

> **Windows users:** The backend uses Linux shell scripts and Linux-oriented worker tooling. **WSL2 is strongly recommended** for full parity. Native PowerShell is possible for API-only scenarios but not supported for the full worker pipeline.

### 1. Install System Dependencies

#### macOS

```bash
brew update
brew install ffmpeg poppler libreoffice redis
```

**LaTeX + Beamer** — choose one:

Option A (full distribution, easiest):

```bash
brew install --cask mactex-no-gui
sudo tlmgr update --self
sudo tlmgr install beamer latexmk
```

Option B (smaller install):

```bash
brew install --cask basictex
export PATH="/Library/TeX/texbin:$PATH"
sudo tlmgr update --self
sudo tlmgr install beamer collection-latexrecommended collection-fontsrecommended xetex latexmk
```

Persist TeX path if using BasicTeX:

```bash
echo 'export PATH="/Library/TeX/texbin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Start Redis:

```bash
brew services start redis
```

#### Linux (Ubuntu/Debian)

The backend ships convenience scripts. From the repo root:

```bash
cd backend
chmod +x install_dependencies_linux.sh check_dependencies.sh
./install_dependencies_linux.sh
./check_dependencies.sh
```

Or install manually:

```bash
sudo apt update
sudo apt install -y \
  ffmpeg \
  poppler-utils \
  libreoffice \
  redis-server \
  texlive-base \
  texlive-latex-base \
  texlive-latex-recommended \
  texlive-latex-extra \
  texlive-fonts-recommended \
  texlive-fonts-extra \
  texlive-xetex \
  latexmk

sudo systemctl enable redis-server
sudo systemctl start redis-server
```

#### Windows (WSL2)

Open PowerShell as Administrator and install WSL2:

```powershell
wsl --install -d Ubuntu
```

Reboot if prompted, then open Ubuntu and follow the Linux steps above.

---

### 2. Create Python Environment

From the repo root:

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate      # Windows WSL: same command
pip install --upgrade pip
pip install uv
uv sync
```

Optional — install Playwright browser runtime (needed for scraping paths):

```bash
uv run playwright install chromium
```

---

### 3. Configure Backend Environment

Copy the example env template:

```bash
# From repo root
cp .env.example backend/.env

# Or if you're already inside backend/
cp ../.env.example .env
```

Edit `backend/.env` with at minimum:

```env
# Required for auth
GOOGLE_CLIENT_ID=your_google_oauth_client_id

# Required for generation flows
GEMINI_API_KEY=your_gemini_api_key
SARVAM_API_KEY=your_sarvam_api_key
```

> All variable names must stay as-is. Do not commit `.env`.

#### Firebase Service Account (required)

The backend expects a Firebase service account JSON at `backend/firebase_service_account.json`.

1. Go to [Firebase Console](https://console.firebase.google.com/) and create (or select) a project.
2. Open **Build → Firestore Database** and create a Firestore database.
3. Open **Project Settings → Service Accounts**.
4. Click **Generate new private key** and download the JSON.
5. Rename the file to `firebase_service_account.json` and move it to `backend/`.

#### Google OAuth Client ID (required)

1. Open [Google Cloud Console](https://console.cloud.google.com/) for the same project.
2. Go to **APIs & Services → OAuth consent screen** and configure it.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Select **Web application**, create it, and copy the Client ID into `backend/.env` as `GOOGLE_CLIENT_ID`.

---

### 4. Verify System Dependencies

```bash
cd backend
./check_dependencies.sh
```

Expected: `ffmpeg`, `pdflatex`, `xelatex`, `pdftoppm`, `pdfinfo`, and `soffice/libreoffice` all detected.

---

### 5. Run the Backend API

From `backend/` with the venv active:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

With auto-reload for development:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Swagger UI will be available at: `http://127.0.0.1:8000/docs`

---

### 6. Run Background Workers (Recommended)

The background workers handle PDF processing, video generation, audio generation, poster generation, and more. For full feature parity, run them alongside the API.

```bash
cd backend
chmod +x start_workers.sh stop_workers.sh
./start_workers.sh
```

View logs:

```bash
tail -f logs/pdf_processor.log
tail -f logs/pdf_worker.log
tail -f logs/arxiv_worker.log
tail -f logs/latex_worker.log
tail -f logs/video_worker.log
tail -f logs/poster_worker.log
tail -f logs/audio_worker.log
```

Stop workers:

```bash
./stop_workers.sh
```

---

### 7. Poster Generation Go Service (Required for Poster Generation)

Poster generation uses a dedicated Go service expected at ports `8080` and `8081`.
Run both instances in separate terminals before testing poster generation.

#### 7.1 Install Go

#### macOS

```bash
brew install go
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y golang-go
```

#### Windows

```powershell
# Option A: winget
winget install GoLang.Go

# Option B: chocolatey
choco install golang
```

Verify:

```bash
go version
```

#### 7.2 Install Go Dependencies

```bash
cd poster-service
go mod tidy
```

#### 7.3 Run Two Go Servers in Two Additional Terminals

Open two more terminals (in addition to backend/frontend terminals):

**Terminal A (Go poster server on port 8080):**

```bash
cd poster-service
go run . --server --port=:8080
```

**Terminal B (Go poster server on port 8081):**

```bash
cd poster-service
go run . --server --port=:8081
```

These two processes are used by the poster worker load balancer.

If `go run .` fails with `go.mod file not found` or `no Go files in ...`, ensure the runnable server entrypoint exists in `poster-service/` and that `go.mod` is present.

---

## Frontend Setup

### 1. Install Node.js

Skip this section if you already have Node 18+.

#### macOS

```bash
# Option A: Homebrew
brew install node

# Option B: nvm
nvm install --lts && nvm use --lts
```

#### Linux

```bash
# Option A: nvm (recommended)
nvm install --lts && nvm use --lts

# Option B: apt
sudo apt update && sudo apt install -y nodejs npm
```

#### Windows

```powershell
# Option A: winget
winget install OpenJS.NodeJS.LTS

# Option B: nvm-windows
nvm install lts
nvm use lts
```

After installing, reopen your terminal and verify:

```bash
node --version
npm --version
```

---

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

---

### 3. Configure Frontend Environment

Create a `.env` file inside `frontend/`:

```env
VITE_APP_API_URL=http://localhost:8000

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

VITE_REACT_APP_GOOGLE_CLIENT_ID=your_google_oauth_client_id

# Optional
VITE_MIXPANEL_TOKEN=your_mixpanel_token
```

> All frontend env variables must be prefixed with `VITE_` to be accessible in-app. Restart the dev server after any `.env` change. Do not commit `.env`.

#### Firebase (Google Login)

1. In your Firebase project, add a **Web App**.
2. Enable **Google sign-in** under **Authentication → Sign-in method**.
3. Copy the Firebase config values into `frontend/.env`.

#### Google OAuth (YouTube Flow)

The codebase currently contains a hardcoded redirect URI for the YouTube OAuth flow:

```
https://summarizesaral.democratiseresearch.in/oauth2callback
```

For this flow to work locally, ensure this URI is listed as an **Authorized redirect URI** in your Google Cloud OAuth client configuration.

---

### 4. Start the Frontend Dev Server

```bash
cd frontend
npm run dev
```

The app runs at `http://localhost:3000`. Vite opens the browser automatically.

---

### Frontend Useful Commands

```bash
npm run dev      # start local development server
npm run build    # create production build (output: build/)
npm run preview  # preview production build locally
npm run lint     # run eslint
```

---

## Running the Full Stack

Once both are configured, run these in separate terminals:

**Terminal 1 — Backend API:**

```bash
cd backend
source .venv/bin/activate
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Background Workers (optional, for full features):**

```bash
cd backend
./start_workers.sh
```

**Terminal 3 — Go Poster Service 1 (required for poster generation):**

```bash
cd poster-service
go run . --server --port=:8080
```

**Terminal 4 — Go Poster Service 2 (required for poster generation):**

```bash
cd poster-service
go run . --server --port=:8081
```

**Terminal 5 — Frontend:**

```bash
cd frontend
npm run dev
```

Then open `http://localhost:3000`.

### Quick Smoke Test

- [ ] App opens at `http://localhost:3000`
- [ ] `http://127.0.0.1:8000/docs` loads Swagger UI
- [ ] `redis-cli ping` returns `PONG`
- [ ] Home page loads without build errors
- [ ] Login page renders
- [ ] After valid login, protected routes are accessible
- [ ] API setup page appears and accepts a Gemini API key

---

## Troubleshooting

### Backend

| Problem                                              | Fix                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `python3.11: command not found`                      | Install Python 3.11: `brew install python@3.11` (macOS) or `sudo apt install python3.11 python3.11-venv` (Ubuntu) |
| Redis not running                                    | `brew services start redis` (macOS) or `sudo systemctl start redis-server` (Linux)                                |
| Missing `pdflatex` / `xelatex` / Beamer              | Install TeX distribution; on Linux ensure `texlive-latex-extra` and `texlive-xetex` are installed                 |
| Missing `soffice` / `libreoffice`                    | Install LibreOffice and verify it is in PATH                                                                      |
| `firebase_service_account.json` errors               | Ensure a valid Firebase service account JSON is at `backend/firebase_service_account.json`                        |
| Playwright/Patchright browser issues                 | Run `uv run playwright install chromium`                                                                          |
| API key errors on generation endpoints               | Set `GEMINI_API_KEY` and `SARVAM_API_KEY` in `backend/.env`                                                       |
| `go: command not found` when starting poster service | Install Go, reopen terminal, and verify with `go version`                                                         |
| `go mod tidy` fails in `poster-service/`             | Ensure `poster-service/go.mod` exists and the service code is complete                                            |
| Poster generation request fails with worker errors   | Confirm both Go servers are running on ports `8080` and `8081`                                                    |

### Frontend

| Problem                      | Fix                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm install` fails          | Check Node/npm versions; delete `node_modules` and retry (`rm -rf node_modules && npm install`)                     |
| Port 3000 already in use     | Stop the conflicting process, then rerun `npm run dev`                                                              |
| Login fails immediately      | Verify all `VITE_FIREBASE_*` values; confirm Firebase Google sign-in is enabled                                     |
| API calls fail / CORS errors | Confirm backend is running at `VITE_APP_API_URL`; confirm backend allows requests from `http://localhost:3000`      |
| OAuth callback issues        | Confirm `VITE_REACT_APP_GOOGLE_CLIENT_ID` is correct; confirm authorized redirect URI is configured in Google Cloud |
| `.env` changes not reflected | Stop and restart `npm run dev`                                                                                      |

---

## Notes for Contributors

- **Never commit secrets.** Keep `.env` files and `firebase_service_account.json` out of version control — they are already in `.gitignore`.
- **Document new environment variables.** Add any new `VITE_` or backend env var to the relevant `.env.example` and to this README immediately.
- **Update this guide** if you add a new local dependency or setup step.
- If you only need API smoke tests, you can run the backend API server alone without workers.
- For full media pipelines (PDF → video, poster generation, audio), run the API server + all workers + all system dependencies.
