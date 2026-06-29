# SARAL AI Backend — Architecture & Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Web / Mobile)                               │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
        ┌───────────▼────────────┐  ┌────▼──────────┐  ┌─────▼──────────┐
        │  HTTPS REST API Calls  │  │  SSE Streaming│  │  File Download │
        │  (Upload, Status,      │  │  (Real-time   │  │  (MP4, PDF,    │
        │   Script Edit, etc)    │  │   Progress)   │  │   Audio, etc)  │
        └────────┬───────────────┘  └───────┬───────┘  └────────┬───────┘
                 │                          │                   │
                 └──────────────────────────┼───────────────────┘
                                            │
        ┌───────────────────────────────────▼────────────────────────────────┐
        │                                                                     │
        │          GO GATEWAY (REST API, Orchestration, Webhooks)            │
        │         ┌──────────────────────────────────────────────────────┐   │
        │         │  Handler Layer                                        │   │
        │         │  • /auth/{login,logout,email/*,oauth/google}         │   │
        │         │  • /api/auth/{me,verify,providers}                   │   │
        │         │  • /api/user/keys                                    │   │
        │         │  • /api/papertovideo/*   (video pipeline)            │   │
        │         │  • /api/papertoslides/*  (slides-only pipeline)      │   │
        │         │  • /api/papertoposter/*  (poster pipeline)           │   │
        │         │  • /api/papertopodcast/* (podcast pipeline)          │   │
        │         │  • /api/papertoreel/*    (reel pipeline)             │   │
        │         │  • /api/patenttovideo/*  (patent pipeline)           │   │
        │         │  • /api/papers/arxiv     (preprint ingest)           │   │
        │         │  • /api/paper/:id/business-brief                     │   │
        │         │  • /api/social/{youtube,linkedin}/*                  │   │
        │         │  • /webhooks/worker/:service                         │   │
        │         └──┬─────────────────┬─────────────────┬──────────────┘   │
        │            │                 │                 │                   │
        │    ┌───────▼────┐   ┌────────▼──────┐  ┌──────▼──────┐           │
        │    │  Firebase  │   │  PostgreSQL   │  │    Redis    │           │
        │    │  Auth      │   │  (State)      │  │  (Streams)  │           │
        │    └────────────┘   └───────────────┘  └─────────────┘           │
        │                                                                     │
        │  ┌────────────────────────────────────────────────────────────┐    │
        │  │  Background Tasks & Integrations                           │    │
        │  │  • LLM script generation (Gemini / Vertex / OpenRouter)   │    │
        │  │  • TTS synthesis (Sarvam / Bhashini / Gemini TTS)         │    │
        │  │  • GCS artifact management (upload/download/presign)      │    │
        │  │  • Redis Stream janitor (stuck-job retry + DLQ)           │    │
        │  │  • SSE Manager (Redis Pub/Sub cross-instance relay)       │    │
        │  │  • Social OAuth + upload (YouTube, LinkedIn)              │    │
        │  │  • Analytics / Firestore event tracking                   │    │
        │  └────────────────────────────────────────────────────────────┘    │
        │                                                                     │
        └──────┬──────────────┬──────────────┬──────────────┬───────────────┘
               │              │              │              │
       ┌───────▼──────┐ ┌─────▼──────┐ ┌────▼──────┐ ┌────▼───────────┐
       │  PDF Parser  │ │   Beamer   │ │  FFmpeg   │ │  Script-Gen /  │
       │  (Python)    │ │  (Python)  │ │  (Python) │ │  Audio-Gen     │
       │              │ │            │ │           │ │  (Go)          │
       │ Consumes:    │ │ Consumes:  │ │ Consumes: │ │                │
       │ saral:jobs:  │ │ saral:jobs:│ │saral:jobs:│ │ Consumes:      │
       │ pdf          │ │ latex      │ │ ffmpeg    │ │ saral:jobs:    │
       │              │ │ poster     │ │ podcast   │ │ script         │
       │ Output:      │ │            │ │ reel      │ │ audio          │
       │ extracted.   │ │ Output:    │ │           │ │                │
       │ json +       │ │ slides.pdf │ │ Output:   │ │ Output:        │
       │ images       │ │ poster.pdf │ │ video.mp4 │ │ script.json    │
       │              │ │ previews   │ │ audio.mp3 │ │ audio chunks   │
       └───────┬──────┘ └─────┬──────┘ └────┬──────┘ └────┬───────────┘
               │              │              │              │
               └──────────────┴──────────────┴──────────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
        ┌───────────▼────────┐  ┌─────▼──────────┐  ┌───▼───────────────┐
        │  PostgreSQL 15     │  │    Redis 7     │  │  Google Cloud     │
        │  (Persistent State)│  │  (Job Queue)   │  │  Storage + APIs   │
        │                    │  │                │  │                   │
        │  Tables:           │  │  Streams:      │  │  External APIs:   │
        │  • users           │  │  saral:jobs:   │  │  • Gemini LLM     │
        │  • papers          │  │  • pdf         │  │  • Vertex AI      │
        │  • pipeline_runs   │  │  • script      │  │  • OpenRouter     │
        │  • pipeline_steps  │  │  • audio       │  │  • Sarvam TTS     │
        │  • artifacts       │  │  • latex       │  │  • Bhashini MT    │
        │  • business_briefs │  │  • poster      │  │  • Firebase Auth  │
        │  • social_tokens   │  │  • ffmpeg      │  │  • YouTube API    │
        │  • user_api_keys   │  │  • podcast     │  │  • LinkedIn API   │
        │                    │  │  • reel        │  │                   │
        │                    │  │  saral:dlq     │  │                   │
        └────────────────────┘  └────────────────┘  └───────────────────┘
```

---

## Data Flow — Paper to Video Pipeline

The primary pipeline. All other pipelines follow the same webhook-driven pattern with different workers and steps.

```
USER UPLOAD  (or POST /api/papers/arxiv for preprint ingest)
    │
    └─> POST /api/papertovideo/upload
        │
        ├─ Validate Firebase token / X-User-ID header
        ├─ Create paper & pipeline_run records in DB
        ├─ Upload PDF to GCS
        ├─ Enqueue job → saral:jobs:pdf
        └─> Return { run_id, paper_id, stream_url, status_url }
            │
            ▼
[WORKER] PDF Parser consumes saral:jobs:pdf
    │
    ├─ Download PDF from GCS
    ├─ Extract text, images, metadata (saraldocling)
    ├─ Upload extracted.json + images to GCS
    └─> POST /webhooks/worker/pdf_extract
        │
        ▼
[GATEWAY] Processes pdf_extract completion
    │
    ├─ Update pipeline_step → completed
    ├─ Enqueue job → saral:jobs:script
    └─> Return 200 OK
        │
        ▼
[WORKER] Script-Gen consumes saral:jobs:script
    │
    ├─ Download extracted.json from GCS
    ├─ Build prompt with audience level + document type
    ├─ Call Gemini / Vertex / OpenRouter LLM
    ├─ Upload script.json to GCS
    └─> POST /webhooks/worker/script_gen
        │
        ▼
[GATEWAY] Processes script_gen completion
    │
    ├─ Update pipeline_step → completed
    ├─ Broadcast SSE: script_gen completed
    └─> Pipeline pauses — waits for user to confirm
        │
[OPTIONAL] User reviews/edits script
    ├─ GET  /api/papertovideo/:run_id/script
    ├─ GET  /api/papertovideo/:run_id/images   (pick figures for slides)
    ├─ PATCH /api/papertovideo/:run_id/script/images
    └─ PUT  /api/papertovideo/:run_id/script
        │
        ▼
POST /api/papertovideo/:run_id/script/confirm
    │
    ├─ Enqueue job → saral:jobs:latex    ─┐
    └─ Enqueue job → saral:jobs:audio    ─┘  both enqueued in parallel
        │                                │
        ▼                                ▼
[WORKER] Beamer                   [WORKER] Audio-Gen
consumes saral:jobs:latex         consumes saral:jobs:audio
    │                                │
    ├─ Generate LaTeX from script     ├─ Chunk narration text
    ├─ Compile → slides.pdf           ├─ Translate if non-English
    ├─ Render PNG previews            │  (Sarvam / Bhashini / Gemini)
    ├─ Upload to GCS                  ├─ Call TTS API per chunk
    └─> POST /webhooks/worker/        ├─ Upload audio chunks to GCS
        beamer_compile                └─> POST /webhooks/worker/
                                          audio_gen
        Both webhooks arrive (order varies)
        Gateway waits until BOTH complete, then:
        │
        ├─ Enqueue job → saral:jobs:ffmpeg
        └─> Broadcast SSE: beamer + audio complete
            │
            ▼
[WORKER] FFmpeg consumes saral:jobs:ffmpeg
    │
    ├─ Download slides.pdf + audio chunks from GCS
    ├─ Composite: slide images + audio narration + transitions
    ├─ Encode → video.mp4 (H.264 / AAC)
    ├─ Upload video.mp4 to GCS
    └─> POST /webhooks/worker/ffmpeg_stitch
        │
        ▼
[GATEWAY] Final webhook
    │
    ├─ Update pipeline_run.status → completed
    ├─ Create artifact records in DB
    ├─ Broadcast SSE: pipeline completed
    └─> Return 200 OK

USER DOWNLOAD
    └─> GET /api/papertovideo/:run_id/download  → presigned GCS URL
        GET /api/papertovideo/:run_id/video     → streaming Range-aware MP4
```

---

## Workers

| Worker | Language | Redis stream(s) consumed | Output |
|---|---|---|---|
| **pdf-parser** | Python | `saral:jobs:pdf` | `extracted.json` + images in GCS |
| **script-gen** | Go | `saral:jobs:script` | `script.json` in GCS |
| **audio-gen** | Go | `saral:jobs:audio` | audio chunk WAVs in GCS |
| **beamer** (`latex-worker`) | Python | `saral:jobs:latex` | `slides.pdf` + preview PNGs in GCS |
| **beamer** (`poster-worker`) | Python | `saral:jobs:poster` | `poster.pdf` in GCS |
| **ffmpeg-job** | Python | `saral:jobs:ffmpeg`, `saral:jobs:podcast`, `saral:jobs:reel` | `video.mp4` / `audio.mp3` / reel MP4 in GCS |

All workers:
1. Consume from a Redis Stream consumer group (`saral-workers`)
2. Process the job (download from GCS → transform → upload to GCS)
3. Send a webhook to `POST /webhooks/worker/:service` on completion or failure
4. Retry failed webhook deliveries (3× exponential backoff)

---

## Component Responsibilities

### Gateway (Go)
- **REST API**: All client-facing HTTP routes across six pipelines
- **Authentication**: Firebase token verification + email/password auth + OAuth (Google, YouTube, LinkedIn)
- **State Management**: PostgreSQL reads/writes (users, papers, runs, steps, artifacts, social tokens, user API keys)
- **Job Orchestration**: Enqueues jobs to Redis Streams; coordinates parallel steps (beamer + audio)
- **Webhook Receiver**: Processes completion notifications from all workers
- **SSE Manager**: Redis Pub/Sub relay for cross-instance real-time progress broadcast
- **Janitor**: Background goroutine monitors stuck jobs (> 1 hour), retries or moves to DLQ
- **Social Sharing**: YouTube and LinkedIn OAuth flows + video/post upload
- **Analytics**: Firestore event tracking (non-fatal on failure)

### PDF Parser (Python)
- Extracts text, images, and metadata from PDF using `saraldocling`
- Uploads `extracted.json` + image files to GCS

### Script-Gen (Go)
- Calls Gemini / Vertex AI / OpenRouter to generate structured `script.json`
- Supports three LLM backends switchable via `LLM_PROVIDER` env var
- Handles `document_type=patent` for the patent pipeline

### Audio-Gen (Go)
- Chunks narration text and calls TTS per chunk
- Supports Sarvam Bulbul v3 (default), Bhashini (regional), Gemini TTS (Portuguese)
- Handles Bhashini / Sarvam translation for non-English languages

### Beamer (Python — two processes)
- **latex-worker**: Script JSON → LaTeX Beamer → `slides.pdf` + preview PNGs
- **poster-worker**: Extracted content → single-page academic `poster.pdf`
- Supports `beamer_pdf` and `ppt` output formats; custom `.pptx` template upload

### FFmpeg Job (Python)
- **ffmpeg stream**: Composites slides + audio → `video.mp4` (H.264/AAC)
- **podcast stream**: Generates audiogram-style podcast video
- **reel stream**: Composites AI avatar reel video

---

## Key Design Patterns

### 1. Stateless Microservices
- Gateway and workers share no in-process state
- All durable state lives in PostgreSQL; ephemeral job state lives in Redis
- Multiple gateway instances can run behind a load balancer

### 2. Asynchronous Job Processing via Redis Streams
- Consumer groups (`saral-workers`) allow horizontal worker scaling
- Workers process independently and report back via webhooks
- Decouples worker language/framework from gateway

### 3. Webhook-Driven Orchestration
- Workers push completion notifications (not polled)
- Gateway coordinates parallel steps: waits for both beamer and audio before enqueuing ffmpeg
- Independent deployment and scaling per worker

### 4. Human-in-the-Loop Script Review
- Pipeline pauses after `script_gen` in all video/slides/reel pipelines
- Users can fetch, edit, assign figures, then confirm to resume
- Skipping edit and calling `/confirm` immediately is always valid

### 5. Real-Time Progress via SSE
- SSE connections per run handled by the SSE Manager
- Redis Pub/Sub relays events across gateway instances (no sticky sessions needed)

### 6. Resilience & Retry
- Workers retry webhook deliveries 3× with exponential backoff
- Gateway janitor monitors stuck jobs and promotes them to DLQ after 1 hour
- Client-facing `/retry` endpoint resumes a run from its last completed checkpoint

### 7. Per-User API Key Override
- Users can store their own Gemini / Sarvam keys via `PUT /api/user/keys`
- Gateway encrypts keys at rest (`KEYS_ENCRYPTION_KEY`) and passes them to workers at job enqueue time

---

## Scaling Strategy

- **Gateway**: Horizontal scaling via load balancer; stateless; SSE uses Redis Pub/Sub so any instance can serve any client
- **PDF Parser / Beamer / Script-Gen / Audio-Gen**: Scale on queue depth; consumer groups let multiple instances share work safely
- **FFmpeg Job**: CPU/memory heavy → Cloud Run with auto-scaling and concurrency limits
- **PostgreSQL**: Connection pooling via `pgx` pool; Cloud SQL in production
- **Redis**: Cloud Memstore with replication; streams provide built-in queue depth metrics
- **GCS**: Managed service; presigned URLs offload download bandwidth from the gateway

---

## Error Handling & Observability

- **Webhook Retry**: Workers retry 3× with exponential backoff before marking a step failed
- **Job Janitor**: Background goroutine in the gateway promotes jobs stuck > 1 hour to `saral:dlq`
- **Client Retry**: `POST /:run_id/retry` resumes from the last completed checkpoint
- **Graceful Degradation**: External API failure marks the step failed and broadcasts SSE error — other pipelines are unaffected
- **Logging**: Structured logs in Go (`log.Printf`); Python workers log to stdout (captured by container runtime)
- **SSE Events**: Every pipeline state transition is broadcast in real time so the frontend always reflects current state
