# SARAL: Simplified And Automated Research Amplification and Learning

SARAL is a full-stack application that transforms research papers (LaTeX or arXiv) into AI-generated video presentations, podcasts, posters, and business briefs. It leverages a Go gateway orchestrator, six specialized workers, and a Next.js 16 frontend with Firebase authentication to deliver a seamless pipeline from paper upload to downloadable media.

```
saral/
├── backend/
│   ├── gateway/                 Go REST API + orchestrator (port 8080)
│   ├── services/
│   │   ├── pdf-parser/          Python worker — PDF text/image extraction
│   │   ├── beamer/              Python worker — LaTeX slides + posters (2 processes)
│   │   ├── ffmpeg-job/          Python worker — video stitching
│   │   ├── script-gen/          Go worker — LLM script generation
│   │   ├── audio-gen/           Go worker — TTS via Sarvam / Bhashini / Gemini
│   │   └── shared/              Python shared library (saral_shared)
│   ├── migrations/              Plain SQL, applied with psql
│   ├── docker-compose.yml       Postgres + Redis + fake-GCS
│   ├── Procfile.dev             overmind process definitions
│   ├── .env.shared              Shared config for all workers
│   ├── ROUTES.md                Full API reference
│   └── ARCHITECTURE.md          System design & data flow
└── frontend/
    ├── app/                     Next.js 16 App Router pages
    ├── components/              shadcn UI, dashboard, modals, landing, auth
    ├── lib/                     API client, zustand stores, Firebase, types
    ├── CLAUDE.md                Design-system rules — read before UI work
    └── .env.local               Firebase web config
```

**Architecture in one sentence:** The Next.js frontend (port 3000) talks to the Go gateway (port 8080). The gateway authenticates via Firebase, stores state in Postgres, uploads artifacts to GCS (fake-GCS locally), and enqueues jobs on Redis Streams. Six workers consume those streams and report back via webhooks; the gateway pushes progress to the browser over SSE. Pipeline: `pdf_extract → script_gen → [user confirms script] → beamer_compile ∥ audio_gen → ffmpeg_stitch → video.mp4`.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Setup](#repository-setup)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Running the Full Stack](#running-the-full-stack)
- [Quick Smoke Test](#quick-smoke-test)
- [Troubleshooting](#troubleshooting)
- [Notes for Contributors](#notes-for-contributors)

---

## Prerequisites

Before anything else, make sure you have these installed:

- **Git**
- **Docker Desktop** — for Postgres, Redis, and fake-GCS containers
- **Node.js** (active LTS, **Node 20+**) — comes bundled with `npm`
- **Python 3.11.x** — required by the Python workers
- **Go** (recommended **1.25+**) — required for gateway, script-gen, and audio-gen
- **overmind** — process manager: `brew install overmind`
- **A modern browser** (Google Chrome recommended)

Quick version checks:

```bash
node --version
npm --version
python3.11 --version
go version
docker compose version
overmind --version
```

**Windows users:** You must use **WSL2** (Windows Subsystem for Linux). Do not try to run `overmind` or `poppler` on native Windows.

---

## Repository Setup

```bash
git clone <your-repository-url>
cd saral
```

---

## Backend Setup

All commands from `saral/backend/`.

### 1. Install System Dependencies

#### macOS

```bash
brew install go python@3.11 uv overmind ffmpeg poppler redis postgresql node

# LaTeX + Beamer (choose one):
# Option A (full distribution):
brew install --cask mactex-no-gui
sudo tlmgr update --self
sudo tlmgr install beamer latexmk

# Option B (smaller install):
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

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  ffmpeg poppler-utils \
  redis-server postgresql-client \
  texlive-xetex texlive-fonts-recommended \
  texlive-latex-recommended texlive-latex-extra latexmk

sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Install Go, Node, Docker, and overmind following their official guides.

#### Windows (WSL2)

Open PowerShell as Administrator and install WSL2:

```powershell
wsl --install -d Ubuntu
```

Reboot if prompted, then open Ubuntu and follow the Linux steps above.

### 2. Start Infrastructure

```bash
docker compose up -d
docker compose ps     # wait for postgres + redis → "healthy"
```

This starts (host ports):

| Container | Host port | Notes |
|---|---|---|
| Postgres 15 | 5433 | user `saral_app`, password `localpassword`, db `saral` |
| Redis 7 | 6380 | Job streams |
| fake-GCS | 4443 | Bucket `saral-artifacts-local` auto-created |

Health checks:

```bash
psql "postgresql://saral_app:localpassword@localhost:5433/saral" -c "SELECT 1;"
redis-cli -p 6380 ping                                  # PONG
curl -s http://localhost:4443/storage/v1/b | head -5    # JSON
```

### 3. Apply Numbered Migrations

`init.sql` is applied automatically by the container on first boot. Apply the numbered migrations manually, in order:

```bash
for f in migrations/0*.sql; do
  echo "== $f"
  psql "postgresql://saral_app:localpassword@localhost:5433/saral" -f "$f"
done
```

Verify: `psql "postgresql://saral_app:localpassword@localhost:5433/saral" -c "\dt"` should list `users`, `papers`, `pipeline_runs`, `pipeline_steps`, `artifacts`, and more.

### 4. Create Environment Files

#### `backend/.env.shared`

Loaded by all six workers:

```env
# ── Infrastructure (matches docker-compose.yml) ─────────────────
ENV=local
DATABASE_URL=postgresql://saral_app:localpassword@localhost:5433/saral
REDIS_URL=redis://localhost:6380
STORAGE_BUCKET=saral-artifacts-local
STORAGE_EMULATOR_HOST=http://localhost:4443

# ── Worker → gateway callbacks ──────────────────────────────────
GATEWAY_WEBHOOK_URL=http://localhost:8080
FRONTEND_BASE_URL=http://localhost:3000

# ── External APIs (pipeline fails without these) ────────────────
GEMINI_API_KEY=<your-gemini-key>          # script-gen + audio-gen
SARVAM_API_KEY=<your-sarvam-key>          # audio-gen (TTS)
GCP_PROJECT_ID=<your-gcp-project-id>

# ── Translation ─────────────────────────────────────────────────
TRANSLATION_PROVIDER=sarvam

# ── Social publishing (leave blank locally) ─────────────────────
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
```

#### `backend/gateway/.env`

Loaded only by the gateway:

```env
ENV=local
PORT=8080
DATABASE_URL=postgresql://saral_app:localpassword@localhost:5433/saral
REDIS_URL=redis://localhost:6380
STORAGE_BUCKET=saral-artifacts-local
STORAGE_EMULATOR_HOST=http://localhost:4443
FRONTEND_BASE_URL=http://localhost:3000

# ── Firebase ────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=<your-firebase-project-id>
FIREBASE_CREDENTIALS_FILE=./firebase-service-account.json
FIREBASE_WEB_API_KEY=<your-firebase-web-api-key>

# ── Per-user API key encryption ─────────────────────────────────
KEYS_ENCRYPTION_KEY=<random-32-byte-base64>   # generate: openssl rand -base64 32

# ── GCP (prod only) ───────────────────────────────────────────────
GCP_PROJECT_ID=
GCP_REGION=asia-south1
SARVAM_API_KEY=<your-sarvam-key>
```

#### Choosing an LLM Provider

The `script-gen` worker supports three LLM backends. Set `LLM_PROVIDER` in `backend/.env.shared`:

| Mode | Use case | Required env vars |
|---|---|---|
| `vertex` (default) | Existing GCP deployments | `GCP_PROJECT_ID`, ADC |
| `gemini_api` | Direct Gemini API key | `GEMINI_API_KEY` |
| `openrouter` | Any model on OpenRouter (GPT, Claude, Llama, Gemini, free tier) | `OPENROUTER_API_KEY` |

Example for OpenRouter:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_FLASH_MODEL=openrouter/free
OPENROUTER_PRO_MODEL=openai/gpt-oss-120b:free
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_SITE_NAME="Saral Dev"
```

Any OpenRouter model slug works for the two model variables.

### 5. Place Required Secret Files

| File | Location | How |
|---|---|---|
| Firebase service account | `gateway/firebase-service-account.json` | Download from Firebase Console → Service accounts |
| Common passwords | `gateway/internal/auth/common_passwords.txt` | `curl -s https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt -o gateway/internal/auth/common_passwords.txt` |
| Audio-gen models | `services/audio-gen/models.json` | A stub `[]` is fine when `TRANSLATION_PROVIDER=sarvam` |

### 6. Install Dependencies

```bash
# Go gateway
cd gateway && go mod tidy && cd ..

# Python workers (4 services)
export UV_LINK_MODE=copy
for svc in pdf-parser beamer ffmpeg-job shared; do
  cd services/$svc
  uv sync --python 3.11
  cd ../..
done
```

The Go workers (`script-gen`, `audio-gen`) need no install step — `go run` resolves modules on first start.

### 7. Start Everything

```bash
overmind start -f Procfile.dev
```

Seven processes start: `gateway`, `pdf-parser`, `latex-worker`, `poster-worker`, `ffmpeg-worker`, `script-gen`, `audio-gen`.

**WSL users:** If you get `bind: operation not supported`, run:

```bash
OVERMIND_SOCKET=/tmp/overmind.sock overmind start -f Procfile.dev
```

### 8. Verify

```bash
curl http://localhost:8080/health
# → {"success":true,"data":{"status":"ok"},...}

# Upload a test paper (local auth bypass — no Firebase needed):
curl -X POST http://localhost:8080/api/papertovideo/upload \
  -H "X-User-ID: testuser1" \
  -F "pdf=@/path/to/paper.pdf"

# Watch it process live:
curl -N http://localhost:8080/api/papertovideo/<run_id>/stream -H "X-User-ID: testuser1"
```

The pipeline pauses after `script_gen` for human review. Confirm to continue:

```bash
curl -X POST http://localhost:8080/api/papertovideo/<run_id>/script/confirm \
  -H "X-User-ID: testuser1" -H "Content-Type: application/json" -d '{}'
```

---

## Frontend Setup

All commands from `saral/frontend/`.

### 1. Install Node.js

Skip this if you already have Node 20+:

#### macOS

```bash
brew install node
```

#### Linux

```bash
sudo apt update && sudo apt install -y nodejs npm
```

### 2. Install Frontend Dependencies

```bash
npm install     # postinstall copies pdfjs worker → public/pdfjs/
```

(bun also works: `bun install` — a `bun.lock` is checked in.)

### 3. Configure Frontend Environment

Create `frontend/.env.local` (values from Firebase Console → Project Settings → General → Your apps → Web app):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<senderId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>

# Gateway URL (defaults to http://localhost:8080 if unset)
NEXT_PUBLIC_GATEWAY=http://localhost:8080
```

Restart the dev server after changing `.env.local`.

### 4. Start the Frontend Dev Server

```bash
npm run dev     # → http://localhost:3000
```

### Frontend Useful Commands

```bash
npm run dev         # start local development server
npm run build       # create production build
npm run lint        # run ESLint
npx tsc --noEmit    # TypeScript type-check
```

---

## Running the Full Stack

Once everything is configured, run these in separate terminals:

**Terminal 1 — Infrastructure (once; survives reboots until `docker compose down`):**

```bash
cd backend && docker compose up -d
```

**Terminal 2 — Backend services:**

```bash
cd backend && overmind start -f Procfile.dev
```

**Terminal 3 — Frontend:**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`.

| Task | Command |
|---|---|
| Logs for one service | `overmind connect gateway` (Ctrl+B, D to detach) |
| Restart one service | `overmind restart latex-worker` |
| Stop backend | `overmind kill` |
| Stop infra (keep data) | `docker compose down` |
| Stop infra (wipe data) | `docker compose down -v` (re-apply numbered migrations) |

### Quick Smoke Test

- [ ] App opens at `http://localhost:3000`
- [ ] `http://localhost:8080/health` returns `{"success":true,...}`
- [ ] `redis-cli -p 6380 ping` returns `PONG`
- [ ] Frontend loads without build errors
- [ ] Login page renders
- [ ] After valid login, protected routes are accessible
- [ ] API keys page appears and accepts a Gemini / OpenRouter key

---

## Troubleshooting

### Backend

| Problem | Fix |
|---|---|
| `python3.11: command not found` | Install Python 3.11: `brew install python@3.11` (macOS) or `sudo apt install python3.11` (Ubuntu) |
| `pattern common_passwords.txt: no matching files found` | Download SecLists file (see step 5 above) |
| `Firebase init failed: cannot read credentials file` | Service-account JSON missing at path in `FIREBASE_CREDENTIALS_FILE` |
| `Firebase init failed: no private key data found` | The JSON is a placeholder — download the real key from Firebase Console |
| `dial tcp [::1]:6380: connect: connection refused` | Infra not running — `docker compose ps` must show `0.0.0.0:6380->6379`. If not: `docker compose down && docker compose up -d` from `backend/` |
| `go vet` fails | Run `go mod tidy` first |
| Python `ModuleNotFoundError` | Recreate that worker's venv — only 4 Python services exist; `uv sync` in Go workers errors (harmless) |
| `xelatex failed` / blank slides | Install TeX distribution (`brew install --cask basictex`) and restart terminal |
| `ffmpeg-worker` fails | `brew install ffmpeg` |
| `pdf2image` / poppler errors | `brew install poppler` |
| `script_gen` fails | `GEMINI_API_KEY` missing/invalid (or `OPENROUTER_API_KEY` when using `LLM_PROVIDER=openrouter`) |
| `audio_gen` fails | `SARVAM_API_KEY` missing/invalid |
| Pipeline "stuck" after `script_gen` | Intentional human-review pause — `POST /script/confirm` |

### Frontend

| Problem | Fix |
|---|---|
| `npm install` fails | Check Node/npm versions; delete `node_modules` and retry |
| Port 3000 already in use | Stop the conflicting process, then rerun `npm run dev` |
| `auth/invalid-api-key` in console | `.env.local` Firebase values missing/wrong; restart dev server after editing |
| Login fails immediately | Verify all `NEXT_PUBLIC_FIREBASE_*` values; confirm Firebase Google sign-in is enabled |
| API calls fail / CORS errors | Confirm gateway is running at `NEXT_PUBLIC_GATEWAY` (default `http://localhost:8080`) |
| PDF previews broken | `public/pdfjs/pdf.worker.min.mjs` missing — re-run `npm install` (postinstall copies it) |
| `.env.local` changes not reflected | Stop and restart `npm run dev` |

---

## Notes for Contributors

- **Never commit secrets.** Keep `.env*`, `firebase-service-account.json`, and `*firebase*.json` out of version control — they are already in `.gitignore`.
- **Document new environment variables** in both `.env.shared` / `.env.local` and in this README immediately.
- **Update this guide** if you add a new local dependency or setup step.
- **Run linters before pushing:** `go vet ./...`, `ruff check .`, `bun run lint`, `npx tsc --noEmit`.
- For full contribution guidelines, code of conduct, and PR checklist, see [CONTRIBUTING.md](CONTRIBUTING.md).
- For the deeper architecture guide, env-var reference, and route catalog, see [SETUP.md](SETUP.md), [backend/ROUTES.md](backend/ROUTES.md), and [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md).
