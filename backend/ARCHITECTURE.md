# SARAL Backend — Architecture Diagram & Overview

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
        │  (Upload, Status,      │  │  (Real-time   │  │  (Video MP4)   │
        │   Script Edit, etc)    │  │   Progress)   │  │                │
        └────────┬────────────────┘  └───────┬──────┘  └────────┬───────┘
                 │                           │                  │
                 └───────────────────────────┼──────────────────┘
                                             │
        ┌────────────────────────────────────▼───────────────────────────────┐
        │                                                                      │
        │         GO GATEWAY (REST API, Orchestration, WebHooks)             │
        │         ┌───────────────────────────────────────────────────────┐  │
        │         │  Handler Layer                                         │  │
        │         │  • auth/{login, logout, me, verify}                   │  │
        │         │  • papertovideo/{upload, status, script, ...}         │  │
        │         │  • webhooks/worker/{service}                          │  │
        │         └──┬────────────────┬────────────────┬──────────────────┘  │
        │            │                │                │                      │
        │    ┌───────▼────┐   ┌──────▼────────┐  ┌────▼────────┐             │
        │    │  Firebase   │   │ PostgreSQL DB │  │   Redis     │             │
        │    │  Auth       │   │  (State)      │  │ (Job Queue) │             │
        │    └─────────────┘   └────────────────┘  └─────────────┘             │
        │                                                                      │
        │  ┌──────────────────────────────────────────────────────────────┐   │
        │  │  Background Tasks & API Integrations                         │   │
        │  │  • Script Generation (Gemini LLM API)                       │   │
        │  │  • Text-to-Speech Synthesis (Sarvam API)                   │   │
        │  │  • GCS Artifact Management (Upload/Download)               │   │
        │  │  • Redis Stream Janitor (Retry logic)                      │   │
        │  │  • SSE Manager (Real-time event broadcast)                 │   │
        │  └──────────────────────────────────────────────────────────────┘   │
        │                                                                      │
        └──────┬──────────────────────┬──────────────────────┬────────────────┘
               │                      │                      │
       ┌───────▼──────┐      ┌────────▼───────┐    ┌────────▼───────┐
       │  PDF Parser  │      │    Beamer      │    │   FFmpeg Job   │
       │  (Python)    │      │  (Python)      │    │   (Python)     │
       │              │      │                │    │                │
       │ Consumes:    │      │ Consumes:      │    │ Consumes:      │
       │ saral:jobs:  │      │ saral:jobs:    │    │ saral:jobs:    │
       │ pdf          │      │ latex          │    │ ffmpeg         │
       │              │      │                │    │                │
       │ Output:      │      │ Output:        │    │ Output:        │
       │ extracted.   │      │ slides.pdf +   │    │ video.mp4      │
       │ json +       │      │ preview PNGs   │    │                │
       │ images       │      │                │    │                │
       └───────┬──────┘      └────────┬───────┘    └────────┬───────┘
               │                      │                      │
               └──────────────────────┼──────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
        ┌───────────▼────────┐  ┌─────▼──────────┐  ┌──▼────────────────┐
        │  PostgreSQL 15     │  │    Redis 7     │  │ Google Cloud      │
        │  (Persistent State)│  │  (Job Queue)   │  │ Storage / Gemini  │
        │                    │  │                │  │ API / Vertex AI   │
        │  Tables:           │  │  Streams:      │  │                   │
        │  • users           │  │  • saral:jobs: │  │ External APIs:    │
        │  • papers          │  │    pdf         │  │ • Sarvam (TTS)    │
        │  • pipeline_runs   │  │  • saral:jobs: │  │ • Firebase Auth   │
        │  • pipeline_steps  │  │    latex       │  │ • Gemini LLM      │
        │  • artifacts       │  │  • saral:jobs: │  │                   │
        │                    │  │    ffmpeg      │  │                   │
        │                    │  │  • saral:dlq   │  │                   │
        │                    │  │                │  │                   │
        └────────────────────┘  └────────────────┘  └───────────────────┘
```

---

## Data Flow — Paper to Video Pipeline

```
USER UPLOAD
    │
    └─> [1] POST /api/papertovideo/upload
        │
        ├─ Validate Firebase token
        ├─ Create paper & run records in DB
        ├─ Upload PDF to GCS
        ├─ Enqueue job: saral:jobs:pdf
        └─> Return run_id + status
            │
            ▼
[WORKER] PDF Parser consumes saral:jobs:pdf
    │
    ├─ Download PDF from GCS
    ├─ Extract text, images, metadata using saraldocling
    ├─ Upload extracted.json to GCS at {run_id}/extracted/
    ├─ Upload images to GCS at {run_id}/extracted/images/
    └─> Send webhook: POST /webhooks/worker/pdf_extract
        │
        ▼
[GATEWAY] Webhook receiver processes pdf_extract completion
    │
    ├─ Update pipeline_step.status → completed
    ├─ Update pipeline_run.current_step → script_gen
    ├─ [ASYNC] Generate script via Gemini LLM
    │  ├─ Download extracted.json
    │  ├─ Build prompt with text + audience level
    │  ├─ Call Gemini API
    │  ├─ Upload script.json to GCS
    │  └─ Update pipeline_step (script_gen) → completed
    ├─ Enqueue job: saral:jobs:latex
    ├─ Broadcast SSE event: script generation complete
    └─> Return 200 OK
        │
        ▼
[OPTIONAL] User edits script
    │
    └─> [2] GET /api/papertovideo/:run_id/script (fetch)
        [3] PUT /api/papertovideo/:run_id/script (update in DB)
        [4] POST /api/papertovideo/:run_id/script/confirm (resume)
            │
            └─> Enqueue job: saral:jobs:latex
                │
                ▼
[WORKER] Beamer consumes saral:jobs:latex
    │
    ├─ Download script.json + images from GCS
    ├─ Generate LaTeX Beamer template from script
    ├─ Compile LaTeX → slides.pdf using pdflatex
    ├─ Convert PDF pages → PNG preview images
    ├─ Upload slides.pdf + preview images to GCS
    └─> Send webhook: POST /webhooks/worker/beamer_compile
        │
        ▼
[GATEWAY] Webhook receiver processes beamer_compile completion
    │
    ├─ Update pipeline_step → completed
    ├─ Update pipeline_run.current_step → audio_gen
    ├─ [ASYNC] Synthesize audio via Sarvam TTS
    │  ├─ Download script.json
    │  ├─ Call Sarvam TTS API
    │  ├─ Upload audio.wav to GCS at {run_id}/audio/
    │  └─ Update pipeline_step (audio_gen) → completed
    ├─ Enqueue job: saral:jobs:ffmpeg
    ├─ Broadcast SSE event: audio generation complete
    └─> Return 200 OK
        │
        ▼
[WORKER] FFmpeg consumes saral:jobs:ffmpeg
    │
    ├─ Download slides.pdf, audio.wav, images from GCS
    ├─ Use FFmpeg to composite:
    │  ├─ Render slide images with timings
    │  ├─ Overlay audio narration
    │  ├─ Add transitions & effects
    ├─ Encode → video.mp4 (H.264, AAC)
    ├─ Upload video.mp4 to GCS at {run_id}/video/
    └─> Send webhook: POST /webhooks/worker/ffmpeg_stitch
        │
        ▼
[GATEWAY] Final webhook completion
    │
    ├─ Update pipeline_step → completed
    ├─ Update pipeline_run.status → completed
    ├─ Create artifact records in DB
    ├─ Broadcast SSE event: pipeline complete
    └─> Return 200 OK
        │
        ▼
USER DOWNLOAD
    │
    └─> [5] GET /api/papertovideo/:run_id/download
        │
        ├─ Verify run belongs to user
        ├─ Stream video.mp4 from GCS
        └─> HTTP Content-Type: video/mp4
```

---

## Component Responsibilities

### Gateway (Go)
- **REST API Handler**: Processes all HTTP requests from clients and workers
- **Authentication**: Firebase token verification via middleware
- **State Management**: Reads/writes to PostgreSQL (users, papers, runs, steps, artifacts)
- **Job Orchestration**: Enqueues jobs to Redis Streams
- **Script Generation**: Calls Gemini LLM API in goroutines
- **Audio Synthesis**: Calls Sarvam TTS API in goroutines
- **Webhook Receiver**: Processes completion notifications from workers
- **Real-Time Events**: SSE manager broadcasts progress updates
- **Janitor Background Task**: Monitors stuck jobs, retries failures, cleans up DLQ

### PDF Parser (Python)
- **Document Ingestion**: Downloads PDF from GCS
- **Text Extraction**: Parses document structure using saraldocling
- **Image Extraction**: Extracts embedded images from PDF
- **Metadata Extraction**: Captures document metadata
- **Result Upload**: Stores extracted.json + images to GCS
- **Webhook Callback**: Notifies gateway of completion

### Beamer (Python)
- **Script to Presentation**: Converts script JSON to LaTeX Beamer template
- **LaTeX Compilation**: Compiles .tex → .pdf using pdflatex
- **Preview Generation**: Converts PDF pages to PNG thumbnails
- **Asset Management**: Downloads/uploads scripts, images, and slides from/to GCS

### FFmpeg Job Worker (Python)
- **Video Composition**: Uses FFmpeg to layer slides, audio, and images
- **Timing Synchronization**: Aligns slide transitions with audio duration
- **Format Encoding**: Encodes final output as MP4 (H.264 video, AAC audio)
- **Large File Handling**: Streams from GCS, processes locally, uploads result

---

## Key Design Patterns

### 1. **Stateless Microservices**
- Gateway and workers don't maintain session state
- All state lives in PostgreSQL (durable) and Redis (ephemeral jobs)
- Multiple gateway instances can run behind a load balancer

### 2. **Asynchronous Job Processing**
- Redis Streams with consumer groups allow horizontal scaling
- Workers consume messages, process independently, send webhooks
- Decouples worker implementation language/framework from gateway

### 3. **Webhook-Driven Orchestration**
- Workers push completion notifications to gateway (not polled)
- Gateway doesn't need to know worker implementation details
- Enables independent deployment and scaling of workers

### 4. **Human-in-the-Loop Script Review**
- Optional pause before LaTeX compilation
- Users can fetch, edit, and confirm scripts
- Resumes pipeline automatically upon confirmation

### 5. **Real-Time Progress Streaming**
- SSE (Server-Sent Events) for live progress without polling
- Redis Pub/Sub broadcasts events to all connected clients
- Enables responsive frontend UX

### 6. **Resilience & Retry Logic**
- Worker webhooks include retry mechanism (3 attempts, exponential backoff)
- Redis janitor monitors stuck jobs and moves to DLQ
- Failed jobs retried with retry_count tracking
- Graceful error reporting to clients via SSE

---

## Deployment Architecture (Production)

```
┌──────────────────────────────────────────────────────────────┐
│                    Load Balancer                             │
└──────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼───┐          ┌───▼───┐         ┌───▼───┐
    │Gateway│          │Gateway│         │Gateway│
    │Pod 1  │          │Pod 2  │         │Pod 3  │
    └───────┘          └───────┘         └───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┬─────────────────┐
        │                  │                  │                 │
    ┌───▼─────┐    ┌──────▼──────┐    ┌──────▼────┐    ┌────────▼──┐
    │Cloud SQL │    │Cloud Memstore   │    │GCS Bucket  │    │Firebase │
    │(Postgres)     │(Redis)      │    │(Artifacts) │    │Auth      │
    └──────────┘    └─────────────┘    └────────────┘    └───────────┘
        │
        │
    ┌───┴────────────────────────────────────────────────┐
    │                                                    │
┌──▼──────┐  ┌───────────┐  ┌──────────┐             ┌──▼──────┐
│PDF Parser   │   Beamer  │  │ FFmpeg   │  External  │Gemini   │
│(K8s Pod)    │ (K8s Pod) │  │(Cloud Run)  APIs      │LLM API  │
│             │           │  │          │             │         │
└─────────────┴───────────┴──┴──────────┴─────────────┴─────────┘
```

---

## Scaling Strategy

- **Gateway**: Horizontal scaling via load balancer; stateless design enables any number of instances
- **PDF Parser / Beamer Workers**: Scale based on queue depth; consumer groups enable multiple instances
- **FFmpeg Jobs**: Heavy resource consumption → Cloud Run with auto-scaling, max parallel jobs
- **Database**: Connection pooling (pgx) prevents connection exhaustion
- **Redis**: Managed service (Cloud Memstore) with replication for failover
- **GCS**: Managed service with built-in redundancy and backups

---

## Error Handling & Observability

- **Webhook Retry**: Workers retry failed webhook deliveries (3x exponential backoff)
- **Job Janitor**: Background goroutine monitors stuck jobs (processing > 1 hour) and moves to DLQ
- **Graceful Degradation**: If external API fails, step marked failed and error sent to client
- **Logging**: Structured logging in Go; Python workers log to stdout (captured by container orchestration)
- **Monitoring**: Redis streams provide queue depth metrics; DB queries can be instrumented with timing
- **SSE Events**: All state transitions broadcast as SSE messages for real-time client feedback
