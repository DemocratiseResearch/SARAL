# SARAL — Complete Local Development Setup

> Single source of truth for getting the **entire** SARAL stack (backend + frontend) running locally.

SARAL transforms academic papers into AI-generated video presentations, podcasts, posters, and business briefs.

---

## Repository Layout

```
saral/
├── backend/
│   ├── gateway/                 Go REST API + orchestrator (port 8080)
│   │   ├── internal/            auth, pipeline, db, sse, gemini, sarvam, …
│   │   ├── .env                 ← you create (gateway-only config)
│   │   └── firebase-service-account.json   ← you download (secret)
│   ├── services/
│   │   ├── pdf-parser/          Python worker — PDF text/image extraction
│   │   ├── beamer/              Python worker — LaTeX slides + posters (2 processes)
│   │   ├── ffmpeg-job/          Python worker — video stitching
│   │   ├── script-gen/          Go worker — Gemini script generation
│   │   ├── audio-gen/           Go worker — Sarvam/Bhashini TTS
│   │   └── shared/              Python shared lib (saral_shared)
│   ├── migrations/              Plain SQL, applied with psql
│   ├── docker-compose.yml       Postgres + Redis + fake-GCS
│   ├── Procfile.dev             overmind process definitions
│   ├── .env.shared              ← you create (shared by ALL workers)
│   ├── ROUTES.md                Full API reference
│   └── ARCHITECTURE.md          System design & data flow
└── frontend/
    ├── app/                     Next.js 16 App Router pages
    ├── components/              ui (shadcn), dashboard, modals, landing, auth
    ├── lib/                     api client, zustand stores, firebase,   work
    └── .env.local               ← you create (Firebase web config)
```

**Architecture in one paragraph:** The Next.js frontend (3000) talks to the Go gateway (8080). The gateway authenticates via Firebase, stores state in Postgres, uploads artifacts to GCS (fake-GCS locally), and enqueues jobs on Redis Streams. Six workers consume those streams and report back via webhooks; the gateway pushes progress to the browser over SSE. Pipeline: `pdf_extract → script_gen → [user confirms script] → beamer_compile ∥ audio_gen → ffmpeg_stitch → video.mp4`.

---

## 1. Prerequisites

> **Windows Users:** You must use **WSL2** (Windows Subsystem for Linux). Do not try to run `overmind` or `poppler` on native Windows. 
> 1. Open PowerShell as Administrator and run `wsl --install`. 
> 2. Open your new `Ubuntu` terminal and run the following exact commands to install Homebrew and the required dependencies:
> 
> ```bash
> # 1. Install Homebrew 
> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
> 
> # 2. Add Homebrew to your PATH
> (echo; echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"') >> ~/.bashrc
> eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
> 
> # 3. Install GCC (required by Homebrew on Linux)
> sudo apt-get update && sudo apt-get install -y build-essential
> ```

```bash
# Core toolchain
brew install go python@3.11 uv overmind redis postgresql node

# Worker system dependencies
brew install ffmpeg poppler            # ffmpeg-job + beamer (pdf2image)
# TeX Live for Beamer (xelatex):
# - macOS: brew install --cask basictex (restart terminal after)
# - Windows/WSL: sudo apt-get install -y texlive-xetex texlive-fonts-recommended texlive-latex-recommended

# Docker Desktop (Postgres/Redis/fake-GCS containers)
# → https://docker.com
```

Verify:

```bash
go version            # ≥ 1.25
python3.11 --version  # 3.11.x
docker compose version
overmind --version
xelatex --version     # after terminal restart
ffmpeg -version
node --version        # ≥ 20
```

### API keys you need

| Key | Where to get it | Used by |
|---|---|---|---|
| Gemini API key | https://aistudio.google.com/app/apikey | script-gen, audio-gen, gateway |
| OpenRouter API key | https://openrouter.ai/keys | script-gen (when `LLM_PROVIDER=openrouter`) |
| Sarvam API key | https://www.sarvam.ai/ (request access) | audio-gen (TTS) |
| Firebase project | https://console.firebase.google.com — create a project, enable **Authentication** (Email/Password + Google) | gateway + frontend |
| Firebase service account JSON | Firebase Console → ⚙️ Project Settings → **Service accounts** → *Generate new private key* | gateway |
| Firebase web config | Firebase Console → ⚙️ Project Settings → **General** → Your apps → Web app | frontend `.env.local`, gateway `FIREBASE_WEB_API_KEY` |

---

## 2. Backend Setup

All commands from `saral/backend/`.

### 2.1 Start infrastructure

```bash
docker compose up -d
docker compose ps     # wait for postgres + redis → "healthy"
```

> **Docker Permission Denied Error (WSL/Linux)?**
> If you get `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`, you can either run the commands with `sudo` (e.g. `sudo docker compose up -d`), or permanently fix it by adding your user to the docker group:
> ```bash
> sudo usermod -aG docker $USER
> newgrp docker
> ```

This starts (host ports):

| Container | Host port | Credentials / notes |
|---|---|---|
| postgres:15-alpine | **5433** | user `saral_app`, password **`localpassword`**, db `saral`. `init.sql` auto-applies on first boot. |
| redis:7-alpine | **6380** | job streams |
| fake-gcs-server | **4443** | bucket `saral-artifacts-local` auto-created by the `fake-gcs-init` container |

> ⚠️ The DB password is `localpassword` (defined in docker-compose.yml).

Health checks:

```bash
psql "postgresql://saral_app:localpassword@localhost:5433/saral" -c "SELECT 1;"
redis-cli -p 6380 ping                                  # PONG
curl -s http://localhost:4443/storage/v1/b | head -5    # JSON
```

### 2.2 Apply numbered migrations

`init.sql` is applied automatically by the container. The numbered ones are **not** — apply manually, in order:

```bash
for f in migrations/0*.sql; do
  echo "== $f"
  psql "postgresql://saral_app:localpassword@localhost:5433/saral" -f "$f"
done
```

Verify: `psql "postgresql://saral_app:localpassword@localhost:5433/saral" -c "\dt"` → should list `users`, `papers`, `pipeline_runs`, `pipeline_steps`, `artifacts`, plus podcast/reel/slides/social/patent tables.

### 2.3 Create `backend/.env.shared`

Loaded by **all six workers** (Python workers via `load_dotenv(../../.env.shared)`, Go workers via `godotenv.Load("../../.env.shared")`). The gateway does **not** read this file.

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

# ── External APIs (REQUIRED — pipeline dies without these) ─────
GEMINI_API_KEY=<your-gemini-key>          # script_gen step fails if missing
SARVAM_API_KEY=<your-sarvam-key>          # audio_gen step fails if missing
GCP_PROJECT_ID=<your-gcp-project-id>

# ── Translation (sarvam is the local-dev default) ──────────────
TRANSLATION_PROVIDER=sarvam

# ── Social publishing (optional — leave blank locally) ─────────
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
```

### 2.3.1 Choosing an LLM provider (script-gen)

The `script-gen` worker is LLM-agnostic. Pick a backend via `LLM_PROVIDER` in `backend/.env.shared`:

| Mode | When to use | Required env vars |
|---|---|---|
| `vertex` *(default)* | Existing GCP deployments; uses Vertex AI Gemini | `GCP_PROJECT_ID`, ADC |
| `gemini_api` | Quick Gemini access via direct API key | `GEMINI_API_KEY` |
| `openrouter` | Any model on OpenRouter (free tier, GPT, Claude, Llama, etc.) | `OPENROUTER_API_KEY` (+ optional model overrides) |

Example `openrouter` block (uncomment in `.env.shared` and fill in your own key):

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_FLASH_MODEL=openrouter/free
OPENROUTER_PRO_MODEL=openai/gpt-oss-120b:free
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_SITE_NAME="Saral Dev"
```

Any OpenRouter model slug works for `OPENROUTER_FLASH_MODEL` and `OPENROUTER_PRO_MODEL`. The `HTTP-Referer` (`OPENROUTER_SITE_URL`) and `X-Title` (`OPENROUTER_SITE_NAME`) headers are recommended by OpenRouter for rankings and attribution.

### 2.4 Create `backend/gateway/.env`

Loaded only by the gateway (its working directory is `gateway/`, so relative paths resolve from there):

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
# Web API key (Console → Project Settings → General) — needed for
# email/password signup + Google OAuth flows:
FIREBASE_WEB_API_KEY=<your-firebase-web-api-key>

# ── GCP (prod only — blank locally) ────────────────────────────
GCP_PROJECT_ID=
GCP_REGION=asia-south1

# ── Per-user API key encryption (users table stores encrypted
#    gemini/sarvam keys) — generate: openssl rand -base64 32 ────
KEYS_ENCRYPTION_KEY=<random-32-byte-base64>

# ── Optional social integrations — blank locally ───────────────
SARVAM_API_KEY=<your-sarvam-key>
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=
```

### 2.5 Place required secret/data files

| File | What | How |
|---|---|---|
| `gateway/firebase-service-account.json` | Firebase Admin credentials | Download real key from Firebase Console → Service accounts. A placeholder will fail with *"no private key data found"*. |
| `gateway/internal/auth/common_passwords.txt` | SecLists 10k list, embedded at compile time | If missing: `curl -s https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt -o gateway/internal/auth/common_passwords.txt` |
| `services/audio-gen/models.json` | Bhashini model registry | A stub file containing just `[]` is fine when `TRANSLATION_PROVIDER=sarvam`. Real Bhashini credentials only needed for the 10 extended Indic languages. |

### 2.6 Install dependencies

```bash
# Go gateway
cd gateway && go mod tidy && cd ..

# Python workers — ONLY these four are Python (script-gen & audio-gen are Go)
# UV_LINK_MODE=copy prevents permission errors on WSL/Windows cross-filesystem mounts
export UV_LINK_MODE=copy
for svc in pdf-parser beamer ffmpeg-job shared; do
  cd services/$svc
  uv sync --python 3.11
  cd ../..
done
```

The Go workers (`script-gen`, `audio-gen`) need no install step — `go run` resolves modules on first start.

### 2.7 Start everything

```bash
overmind start -f Procfile.dev
```

> ** WSL Error: `bind: operation not supported`?**
> Overmind uses Unix sockets, which Windows file systems (`/mnt/c/`) do not natively support. You must tell Overmind to place its socket file on the Linux side (like `/tmp/`):
> ```bash
> OVERMIND_SOCKET=/tmp/overmind.sock overmind start -f Procfile.dev
> ```

Seven processes start: `gateway`, `pdf-parser`, `latex-worker`, `poster-worker`, `ffmpeg-worker`, `script-gen`, `audio-gen`.

> Overmind kills **all** processes if **any** one crashes. When reading crash logs, find the **first** `Exited with code 1` — everything after it showing `KeyboardInterrupt` / `signal: interrupt` is collateral, not a real error.

### 2.8 Verify

```bash
curl http://localhost:8080/health
# → {"success":true,"data":{"status":"ok"},...}

# Upload a test paper using the local auth bypass (no Firebase needed):
curl -X POST http://localhost:8080/api/papertovideo/upload \
  -H "X-User-ID: testuser1" \
  -F "pdf=@/path/to/paper.pdf"

# Watch it process live:
curl -N http://localhost:8080/api/papertovideo/<run_id>/stream -H "X-User-ID: testuser1"
```

The pipeline **pauses after `script_gen`** for human review — confirm to continue:

```bash
curl -X POST http://localhost:8080/api/papertovideo/<run_id>/script/confirm \
  -H "X-User-ID: testuser1" -H "Content-Type: application/json" -d '{}'
```

Full endpoint walkthrough: [backend/ROUTES.md](backend/ROUTES.md).

---

## 3. Frontend Setup

All commands from `saral/frontend/`.

### 3.1 Create `frontend/.env.local`

Values from Firebase Console → ⚙️ Project Settings → **General** → Your apps → Web app (create a web app if none exists):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<senderId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>

# Gateway URL (this is also the default if unset)
NEXT_PUBLIC_GATEWAY=http://localhost:8080
```

`NEXT_PUBLIC_*` vars are inlined at build time — **restart the dev server after changing them**.

### 3.2 Install & run

```bash
npm install     # postinstall copies pdfjs worker → public/pdfjs/
npm run dev     # → http://localhost:3000
```

(bun also works: `bun install && bun dev` — a `bun.lock` is checked in.)

### 3.3 Frontend stack cheat-sheet

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind v4, tokens in `app/globals.css` `@theme inline` |
| Components | shadcn (`components/ui/`) — add via `npx shadcn@latest add <name>` |
| State | zustand: `lib/auth-store.ts`, `lib/paper-store.ts`, `lib/artifact-store.ts` |
| API client | `lib/api.ts` (all gateway calls), types in `lib/types.ts` |
| Auth | Firebase client SDK (`lib/firebase.ts`); guard in `app/dashboard/layout.tsx` |
| Theming | next-themes via `context/ThemeContext.tsx` (light default, class-based dark) |


---

## 4. Daily Workflow

```bash
# Terminal 1 — infra (once; survives reboots until `docker compose down`)
cd saral/backend && docker compose up -d

# Terminal 2 — backend services
cd saral/backend && overmind start -f Procfile.dev

# Terminal 3 — frontend
cd saral/frontend && bun run dev
```

| Task | Command |
|---|---|
| Logs for one service | `overmind connect gateway` (Ctrl+B, D to detach) |
| Restart one service | `overmind restart latex-worker` |
| Stop backend services | `overmind kill` |
| Stop infra (keep data) | `docker compose down` |
| Stop infra (wipe data) | `docker compose down -v` (numbered migrations must be re-applied after) |

---

## 5. Ports Reference

| Service | Port | What |
|---|---|---|
| Frontend (Next.js) | 3000 | Web UI |
| Gateway (Go/Gin) | 8080 | REST API + SSE |
| PostgreSQL | 5433 | State (container 5432) |
| Redis | 6380 | Job streams (container 6379) |
| fake-GCS | 4443 | Artifact storage emulator |

---

## 6. Troubleshooting

### Backend won't start

| Error | Fix |
|---|---|
| `pattern common_passwords.txt: no matching files found` | Download SecLists file → `gateway/internal/auth/common_passwords.txt` (see §2.5) |
| `bhashini registry: read models.json: no such file` | Create `services/audio-gen/models.json` with `[]` (see §2.5) |
| `Firebase init failed: cannot read credentials file` | Service-account JSON missing at path in `FIREBASE_CREDENTIALS_FILE` (relative to `gateway/`) |
| `Firebase init failed: no private key data found` | The JSON is a placeholder — download the real key from Firebase Console |
| `dial tcp [::1]:6380: connect: connection refused` | Infra not running or ports unbound: `docker compose ps` must show `0.0.0.0:6380->6379`. If not: `docker compose down && docker compose up -d` **from `backend/`** |
| Python `ModuleNotFoundError` | Recreate that worker's venv (§2.6). Note: only 4 services are Python — running `uv sync` in `script-gen`/`audio-gen` errors with "No pyproject.toml" (harmless) |
| `xelatex failed` / blank slides | `brew install --cask basictex`, restart terminal |
| ffmpeg-worker fails to stitch | `brew install ffmpeg` |
| pdf2image / poppler errors | `brew install poppler` |

### Pipeline runs but a stage fails

Check `error_message`: `curl -s localhost:8080/api/papertovideo/<run_id>/status -H "X-User-ID: testuser1"`

| Stage | Usual cause |
|---|---|
| `script_gen` | `GEMINI_API_KEY` missing/invalid in `backend/.env.shared`, or (when `LLM_PROVIDER=openrouter`) `OPENROUTER_API_KEY` missing/invalid (`OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter`) |
| `audio_gen` | `SARVAM_API_KEY` missing/invalid in `backend/.env.shared` |
| `beamer_compile` | xelatex missing, or font issues (check `overmind connect latex-worker`) |
| `ffmpeg_stitch` | ffmpeg missing |
| Pipeline "stuck" after script_gen | Not stuck — it's the intentional human-review pause. `POST /script/confirm`. |

### Frontend issues

| Symptom | Fix |
|---|---|
| `auth/invalid-api-key` in browser console | `.env.local` Firebase values missing/wrong; restart dev server after editing |
| API calls hit wrong host | Set `NEXT_PUBLIC_GATEWAY=http://localhost:8080` and restart |
| PDF previews broken | `public/pdfjs/pdf.worker.min.mjs` missing — re-run `npm install` (postinstall copies it) |
| Login works but dashboard kicks you out | Backend gateway not running, or `FIREBASE_PROJECT_ID` mismatch between gateway `.env` and frontend `.env.local` |

### Redis / queue debugging

```bash
redis-cli -p 6380 XLEN saral:jobs:pdf            # queue depth
redis-cli -p 6380 XINFO GROUPS saral:jobs:pdf    # consumer lag
redis-cli -p 6380 XRANGE saral:dlq - + COUNT 10  # dead letters
```

---

## 7. Environment Variable Reference

### `backend/.env.shared` (all workers)

| Variable | Required | Purpose |
|---|---|---|
| `ENV` | yes | `local` / `production` |
| `DATABASE_URL` | yes | Postgres DSN (workers write step state) |
| `REDIS_URL` | yes | Job streams |
| `STORAGE_BUCKET` | yes | `saral-artifacts-local` locally |
| `STORAGE_EMULATOR_HOST` | local only | `http://localhost:4443` — unset in prod |
| `GATEWAY_WEBHOOK_URL` | yes | Where workers POST completion webhooks |
| `LLM_PROVIDER` | no | LLM backend: `vertex` (default), `gemini_api`, or `openrouter` |
| `GEMINI_API_KEY` | depends | Required when `LLM_PROVIDER=gemini_api`; also used by audio-gen |
| `OPENROUTER_API_KEY` | when `LLM_PROVIDER=openrouter` | OpenRouter bearer token |
| `OPENROUTER_FLASH_MODEL` | no | OpenRouter model slug for Flash tier; default `google/gemini-2.5-flash` |
| `OPENROUTER_PRO_MODEL` | no | OpenRouter model slug for Pro tier; default `google/gemini-2.5-pro` |
| `OPENROUTER_SITE_URL` | no | `HTTP-Referer` header sent to OpenRouter |
| `OPENROUTER_SITE_NAME` | no | `X-Title` header sent to OpenRouter |
| `SARVAM_API_KEY` | yes | audio-gen TTS |
| `GCP_PROJECT_ID` | yes | Gemini/Vertex project |
| `TRANSLATION_PROVIDER` | no | `sarvam` (default) / `bhashini` |
| `MODELS_JSON_PATH` | no | Override path to audio-gen models.json |
| `FRONTEND_BASE_URL` | no | Used in links/redirects |
| `LINKEDIN_*` | no | Social publishing (blank locally) |

### `backend/gateway/.env` (gateway only)

| Variable | Required | Purpose |
|---|---|---|
| `ENV`, `PORT` | yes | `local`, `8080` |
| `DATABASE_URL`, `REDIS_URL` | yes | Same values as .env.shared |
| `STORAGE_BUCKET`, `STORAGE_EMULATOR_HOST` | yes | Artifact storage |
| `FIREBASE_PROJECT_ID` | yes | Token verification |
| `FIREBASE_CREDENTIALS_FILE` | yes | Path to service-account JSON (relative to `gateway/`) |
| `FIREBASE_WEB_API_KEY` | for real auth | Email/password + Google OAuth REST flows |
| `KEYS_ENCRYPTION_KEY` | yes | Encrypts per-user API keys stored in `users` table |
| `GEMINI_MODEL` | no | Override default Gemini model |
| `SARAL_ADMIN_UIDS` | no | Comma-separated admin Firebase UIDs |
| `GCP_PROJECT_ID`, `GCP_REGION` | prod only | Cloud Run deployment |
| `YOUTUBE_*`, `LINKEDIN_*`, `DASHBOARD_WEBHOOK_*` | no | Integrations (blank locally) |

### `frontend/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Firebase web SDK |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | 〃 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | 〃 (must match gateway's `FIREBASE_PROJECT_ID`) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | yes | 〃 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | yes | 〃 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | 〃 |
| `NEXT_PUBLIC_GATEWAY` | no | Gateway URL; defaults to `http://localhost:8080` (`NEXT_PUBLIC_API_URL` also accepted) |

---

## 8. Further Reading

- [backend/ROUTES.md](backend/ROUTES.md) — every endpoint with copy-paste curl/Postman examples
- [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) — system diagrams, data flow, scaling
- [backend/AUTH_ENDPOINTS.md](backend/AUTH_ENDPOINTS.md) — auth contract details
- [backend/Saral Overhaul API Collection/](backend/Saral%20Overhaul%20API%20Collection/) — importable API collection

