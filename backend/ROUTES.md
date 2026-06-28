# SARAL Backend — API Routes & Testing Guide

## Overview

All protected routes require `Authorization: Bearer <access_token>`.

**Base URL (local dev):** `http://localhost:8080`

---

# POSTMAN TESTING — Step-by-Step in Pipeline Order

> **Tip:** Set up two Postman variables — `run_id` and `access_token` — and update them after steps 1 and 2. Every subsequent request uses `{{run_id}}` and `{{access_token}}`.

---

## Step 1 — Login

### `POST /auth/login`

Exchange a Firebase ID token for a SARAL JWT access token.

```
POST http://localhost:8080/auth/login
Content-Type: application/json

{
  "token": "<your-firebase-id-token>"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "firebase_uid": "firebase-uid"
    }
  }
}
```

**Save `access_token` → Postman variable `access_token`.**

---

## Step 1.5 — Get All User Papers

### `GET /api/papertovideo/papers`

Fetch all papers and their runs belonging to the authenticated user. Returns papers ordered by creation date (newest first).

```
GET http://localhost:8080/api/papertovideo/papers
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "papers": [
      {
        "id": "paper-uuid-1",
        "user_id": "user-uuid",
        "gcs_source_path": "gs://saral-artifacts-local/user-id/source/paper.pdf",
        "title": "Paper Title from PDF",
        "authors": "Author Names",
        "date": "2024-01-15",
        "created_at": "2026-04-20T10:30:00Z"
      },
      {
        "id": "paper-uuid-2",
        "user_id": "user-uuid",
        "gcs_source_path": "gs://saral-artifacts-local/user-id/source/another_paper.pdf",
        "title": "Another Paper",
        "authors": "Different Author",
        "date": "2024-02-10",
        "created_at": "2026-04-19T14:20:00Z"
      }
    ],
    "count": 2
  }
}
```

- `title`, `authors`, `date` are populated after the script generation step completes
- Returns an empty array if the user has no papers
- Use paper `id` to fetch runs associated with that paper

---

## Step 2 — Upload PDF

### `POST /api/papertovideo/upload`

Upload a research paper PDF. Immediately kicks off the pipeline.

```
POST http://localhost:8080/api/papertovideo/upload
Authorization: Bearer {{access_token}}
Body: form-data
  Key: pdf   Type: File   Value: <select PDF file>
```

Response:

```json
{
  "success": true,
  "data": {
    "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "paper_id": "paper-uuid",
    "user_id": "user-uuid",
    "stream_url": "/api/papertovideo/a1b2.../stream",
    "status_url": "/api/papertovideo/a1b2.../status"
  }
}
```

**Save `run_id` → Postman variable `run_id`.**

---

## Step 3 — Open SSE Stream (keep this open throughout)

### `GET /api/papertovideo/:run_id/stream`

Real-time Server-Sent Events for the entire pipeline. Open this in a separate Postman tab or curl and leave it running.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/stream
Authorization: Bearer {{access_token}}
```

Events you'll see (in order):

```
data: {"step":"pdf_extract","status":"processing","message":"Extracting PDF content"}
data: {"step":"pdf_extract","status":"completed","message":"pdf_extract completed"}
data: {"step":"script_gen","status":"processing","message":"Generating script"}
data: {"step":"script_gen","status":"completed","message":"script_gen completed"}
data: {"step":"beamer_compile","status":"processing","message":"Starting LaTeX compilation"}
data: {"step":"audio_gen","status":"processing","message":"Starting audio generation"}
data: {"step":"beamer_compile","status":"completed","message":"beamer_compile completed"}
data: {"step":"audio_gen","status":"completed","message":"audio_gen completed"}
data: {"step":"ffmpeg_stitch","status":"processing","message":"Stitching video"}
data: {"step":"ffmpeg_stitch","status":"completed","message":"ffmpeg_stitch completed"}
data: {"step":"pipeline","status":"completed","message":"Your video is ready"}
```

> Note: `beamer_compile` and `audio_gen` run **in parallel** after you confirm the script (Step 8). Their completed events may arrive in either order.

**curl alternative:**

```bash
curl -N http://localhost:8080/api/papertovideo/$RUN_ID/stream \
  -H "Authorization: Bearer $TOKEN"
```

---

## Step 4 — Check Status (poll anytime)

### `GET /api/papertovideo/:run_id/status`

Returns the current pipeline state and per-step history.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/status
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "run-uuid",
    "paper_id": "paper-uuid",
    "user_id": "user-uuid",
    "status": "processing",
    "current_step": "script_gen",
    "error_message": null,
    "started_at": "2026-04-15T10:00:00Z",
    "updated_at": "2026-04-15T10:01:30Z",
    "completed_at": null,
    "steps": [
      {
        "name": "pdf_extract",
        "status": "completed",
        "started_at": "...",
        "completed_at": "..."
      },
      {
        "name": "script_gen",
        "status": "processing",
        "started_at": "...",
        "completed_at": null
      },
      {
        "name": "beamer_compile",
        "status": "pending",
        "started_at": null,
        "completed_at": null
      },
      {
        "name": "audio_gen",
        "status": "pending",
        "started_at": null,
        "completed_at": null
      }
    ]
  }
}
```

---

## Step 5 — View Extracted Content (after pdf_extract completes)

### `GET /api/papertovideo/:run_id/extracted`

Returns the raw extracted text, metadata, and GCS paths for all images found in the PDF.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/extracted
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "text": "Full extracted text from the PDF...",
    "image_paths": [
      "gs://saral-artifacts-local/user-id/paper-id/runs/run-id/extracted/images/figure_001.png",
      "gs://saral-artifacts-local/user-id/paper-id/runs/run-id/extracted/images/figure_002.png"
    ],
    "metadata": {
      "title": "Paper Title",
      "authors": ["Author One", "Author Two"],
      "page_count": 15
    }
  }
}
```

---

## Step 6 — Browse Extracted Images with Presigned URLs (after pdf_extract completes)

### `GET /api/papertovideo/:run_id/images`

Returns a presigned HTTP URL **and** GCS path for every image extracted from the PDF. Use these to inspect figures and pick which index to assign to each slide in Step 7.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/images
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "images": [
      {
        "index": 0,
        "url": "http://localhost:4443/storage/v1/b/saral-artifacts-local/o/...?X-Goog-Signature=...",
        "gcs_path": "gs://saral-artifacts-local/user-id/paper-id/runs/run-id/extracted/images/figure_001.png"
      },
      {
        "index": 1,
        "url": "http://localhost:4443/...",
        "gcs_path": "gs://saral-artifacts-local/.../figure_002.png"
      }
    ],
    "expires_in": 3600
  }
}
```

Click any `url` to preview the image. Note the `index` of any figure you want on a slide — use it in Step 7.

---

## Step 7 — Assign Images to Slides (optional, after pdf_extract + script_gen complete)

### `PATCH /api/papertovideo/:run_id/script/images`

Map extracted PDF figures to specific slide sections by image index (from Step 6). The gateway resolves the index to a GCS path and patches `image_assignments` in the stored script without touching any other field.

```
PATCH http://localhost:8080/api/papertovideo/{{run_id}}/script/images
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "assignments": {
    "results": 0,
    "methodology": 1
  }
}
```

- Keys are section `id` values: `introduction`, `methodology`, `results`, `discussion`, `conclusion`.
- Values are 0-based image indices from `GET /images`.
- Partial is fine — only listed sections are updated; others are unchanged.

Response:

```json
{
  "success": true,
  "data": {
    "message": "image assignments saved",
    "image_assignments": {
      "results": "gs://saral-artifacts-local/.../figure_001.png",
      "methodology": "gs://saral-artifacts-local/.../figure_002.png"
    }
  }
}
```

> Alternatively, set `image_assignments` directly using GCS paths in the `PUT /script` body (Step 9a). Either approach works.

---

## Step 8 — Review Generated Script (after script_gen completes)

### `GET /api/papertovideo/:run_id/script`

Returns the full AI-generated script. Gemini automatically extracts the real paper title, authors, and date from the PDF. The SSE stream will fire `script_gen: completed` when ready.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/script
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "audience_level": "intermediate",
    "title": "SEMMA: A Semantic Aware Knowledge Graph Foundation Model",
    "authors": "Arvindh Arun et al.",
    "date": "2025",
    "title_intro": "Welcome to this presentation on \"SEMMA: A Semantic Aware Knowledge Graph Foundation Model\"...",
    "language": "en-IN",
    "output_format": "beamer_pdf",
    "ppt_template": "",
    "voice_gender": "",
    "image_assignments": {},
    "sections": [
      {
        "id": "introduction",
        "title": "Introduction: Bridging the Semantic Gap in Knowledge Graph Foundation Models",
        "summary": "Brief overview of the problem and motivation.",
        "narration": "Full narration text spoken aloud for this slide...",
        "bullets": ["Key point one", "Key point two", "Key point three"]
      }
    ]
  }
}
```

---

## Step 9 — Edit Script and Confirm

### `PUT /api/papertovideo/:run_id/script`

Update any field in the script. Send the **full script object** back (same shape as the GET response).

```
PUT http://localhost:8080/api/papertovideo/{{run_id}}/script
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Copy-paste ready sample body** — replace `PASTE_RUN_ID_HERE` with your actual `run_id`:

```json
{
  "run_id": "PASTE_RUN_ID_HERE",
  "audience_level": "intermediate",
  "title": "SEMMA: A Semantic Aware Knowledge Graph Foundation Model",
  "authors": "Arvindh Arun et al.",
  "date": "2025",
  "title_intro": "Welcome to this presentation on \"SEMMA: A Semantic Aware Knowledge Graph Foundation Model\". This research was conducted by Arvindh Arun et al. and published in 2025. Today, we'll explore the key findings and contributions of this important work. Let's begin by understanding the problem this research addresses.",
  "language": "en-IN",
  "output_format": "beamer_pdf",
  "ppt_template": "",
  "voice_gender": "female",
  "image_assignments": {
    "results": "gs://saral-artifacts-local/user-id/paper-id/runs/run-id/extracted/images/figure_001.png"
  },
  "sections": [
    {
      "id": "introduction",
      "title": "Introduction: Bridging the Semantic Gap in Knowledge Graph Foundation Models",
      "summary": "Introduce the problem of KGFMs neglecting textual semantics and how SEMMA addresses this.",
      "narration": "Good morning, everyone. Today, we're addressing a critical limitation in Knowledge Graph Foundation Models...",
      "bullets": [
        "KGFMs: Promise, but critical limitation",
        "Current KGFMs: Structure-only reliance",
        "Introducing SEMMA: Dual-module KGFM",
        "Integrates transferable textual semantics via LLMs"
      ]
    },
    {
      "id": "methodology",
      "title": "Methodology: SEMMA's Dual-Module Semantic-Aware Pipeline",
      "summary": "Detail SEMMA's three-phase methodology: LLM enrichment, semantic embedding, dual-module fusion.",
      "narration": "SEMMA's innovative approach is built upon a modular, three-pillar pipeline...",
      "bullets": [
        "SEMMA: Modular, three-pillar pipeline",
        "LLM Textual Enrichment: Clean names, descriptions",
        "Dual-Module Parallel Processing: GSTR_R + GTEXT_R",
        "Fusion via MLP: Comprehensive representation"
      ]
    },
    {
      "id": "results",
      "title": "Results: Significant Performance Gains and Robust Generalization",
      "summary": "Present key quantitative results comparing SEMMA to ULTRA across 54 KGs.",
      "narration": "Our extensive experiments across 54 diverse knowledge graphs demonstrate SEMMA's superior performance...",
      "bullets": [
        "SEMMA: Superior performance across 54 KGs",
        "Outperforms SOTA structural baseline (ULTRA)",
        "Fully inductive setting: Nearly 2x more effective",
        "Statistically significant gains (p < 0.05)"
      ]
    },
    {
      "id": "discussion",
      "title": "Discussion: Redefining KGFM Generalization and Competitive Advantage",
      "summary": "Discuss how SEMMA challenges purely structural KGFMs and its competitive advantages.",
      "narration": "SEMMA's results directly challenge the prevailing industry trend of purely structural KGFMs...",
      "bullets": [
        "Challenges purely structural KGFMs",
        "Textual semantics: Critical for true generalization",
        "Modular design: Adaptability, graceful degradation",
        "Sets new standard for rigorous evaluation"
      ]
    },
    {
      "id": "conclusion",
      "title": "Conclusion: Scalability, Implementation, and Future Directions",
      "summary": "Summarize SEMMA's contributions, scalability, and outline next steps for professional teams.",
      "narration": "In conclusion, SEMMA represents a significant step towards semantically grounded Knowledge Graph Foundation Models...",
      "bullets": [
        "SEMMA: Significant step for KGFMs",
        "Scalable LLM enrichment: One-time process",
        "Publicly available codebase",
        "Future: Entity-level semantics, multilingual"
      ]
    }
  ]
}
```

**Field quick reference:**

| Field               | Values                                                                                            | Effect                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `language`          | `en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `bn-IN`, `gu-IN`, `pa-IN`, `od-IN` | Slide font + audio TTS language. Non-English: narration Bhashini-translated → Sarvam TTS; slide bullets Bhashini-translated too. |
| `output_format`     | `beamer_pdf` / `ppt`                                                                              | XeLaTeX PDF or PowerPoint template fill                                                                                          |
| `ppt_template`      | `sampleppt` / `template-saral`                                                                    | Which `.pptx` to use (only when `output_format: ppt`)                                                                            |
| `voice_gender`      | `male` / `female`                                                                                 | Speaker pool: male = aditya/shubh/aayan, female = simran/roopa/ishita                                                            |
| `image_assignments` | `{ "section_id": "gs://..." }`                                                                    | GCS paths from Step 6. Image appears as right-hand column (40%) on that slide.                                                   |

Response:

```json
{ "success": true, "data": { "message": "script updated" } }
```

> Skip this step to confirm with the generated script as-is. `image_assignments` defaults to empty — no images on slides.

---

### `POST /api/papertovideo/:run_id/script/confirm`

Confirm the script and kick off **parallel** `beamer_compile` + `audio_gen`. Optionally override voice, TTS language, and output format here without doing a full PUT.

```
POST http://localhost:8080/api/papertovideo/{{run_id}}/script/confirm
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "output_format": "beamer_pdf",
  "voice_gender": "female",
  "language": "en-IN"
}
```

All body fields are optional — send `{}` to use whatever is already stored in the script.

| Field           | Values                                 | Default      | Controls                                        |
| --------------- | -------------------------------------- | ------------ | ----------------------------------------------- |
| `output_format` | `beamer_pdf` / `ppt`                   | `beamer_pdf` | Renderer                                        |
| `ppt_template`  | `sampleppt` / `template-saral`         | `sampleppt`  | PPT template (ppt mode only)                    |
| `voice_gender`  | `male` / `female`                      | `female`     | TTS speaker pool                                |
| `language`      | BCP-47 code (see `GET /api/languages`) | `en-IN`      | Slide text translation **+** audio TTS language |

Response:

```json
{
  "success": true,
  "data": {
    "message": "beamer_compile and audio_gen started in parallel",
    "next_steps": ["beamer_compile", "audio_gen"]
  }
}
```

After this, watch the SSE stream: you will see both `beamer_compile: processing` and `audio_gen: processing` almost simultaneously. `ffmpeg_stitch` starts automatically when **both** complete.

---

## Step 10 — View Compiled Slides PDF (after beamer_compile completes)

### `GET /api/papertovideo/:run_id/slides`

Returns a presigned URL to download/preview the compiled presentation PDF.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/slides
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "slides_pdf_url": "http://localhost:4443/storage/v1/b/saral-artifacts-local/o/...?X-Goog-Signature=...",
    "expires_in": 3600
  }
}
```

Click the `slides_pdf_url` in Postman to preview the PDF in your browser.

---

## Step 11 — View Audio Manifest (after audio_gen completes)

### `GET /api/papertovideo/:run_id/audio`

Returns the full audio manifest — GCS paths for every WAV chunk across all slides.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/audio
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "slides": [
      {
        "frame_index": 0,
        "audio_paths": [
          "gs://saral-artifacts-local/.../audio_gen/slide_0_chunk_0.wav"
        ]
      },
      {
        "frame_index": 1,
        "audio_paths": [
          "gs://saral-artifacts-local/.../audio_gen/slide_1_chunk_0.wav",
          "gs://saral-artifacts-local/.../audio_gen/slide_1_chunk_1.wav"
        ]
      }
    ]
  }
}
```

---

## Step 12 — Preview Audio for a Specific Slide (after audio_gen completes)

### `GET /api/papertovideo/:run_id/audio/:slide_index`

Returns presigned URLs for just one slide's audio chunks.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/audio/1
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "slide_index": 1,
    "audio_urls": [
      "http://localhost:4443/storage/v1/b/.../slide_1_chunk_0.wav?X-Goog-Signature=...",
      "http://localhost:4443/storage/v1/b/.../slide_1_chunk_1.wav?X-Goog-Signature=..."
    ],
    "expires_in": 3600
  }
}
```

---

## Step 13 — Download Final Video (after ffmpeg_stitch completes)

### `GET /api/papertovideo/:run_id/download`

Returns a presigned URL to download the final MP4. SSE will fire `pipeline: completed` when ready.

```
GET http://localhost:8080/api/papertovideo/{{run_id}}/download
Authorization: Bearer {{access_token}}
```

Response:

```json
{
  "success": true,
  "data": {
    "url": "http://localhost:4443/storage/v1/b/saral-artifacts-local/o/...?X-Goog-Signature=...",
    "expires_in": 3600
  }
}
```

In Postman: open the `url` in a browser tab to download the MP4, or:

```bash
curl "$URL" -o output.mp4
```

---

## Quick Reference Cheat Sheet

> **Discovery routes** (no auth, call anytime): `GET /api/templates` — PPT templates · `GET /api/voices` — TTS voice pools · `GET /api/languages` — supported languages

| #   | Method | Endpoint                                       | When                                 | Prerequisite step        |
| --- | ------ | ---------------------------------------------- | ------------------------------------ | ------------------------ |
| 1   | POST   | `/auth/login`                                  | Start                                | —                        |
| 2   | POST   | `/api/papertovideo/upload`                     | Immediately after login              | —                        |
| 3   | GET    | `/api/papertovideo/:run_id/stream`             | Keep open throughout                 | upload                   |
| 4   | GET    | `/api/papertovideo/:run_id/status`             | Poll anytime                         | upload                   |
| 5   | GET    | `/api/papertovideo/:run_id/extracted`          | After `pdf_extract` completes        | pdf_extract              |
| 6   | GET    | `/api/papertovideo/:run_id/images`             | After `pdf_extract` completes        | pdf_extract              |
| 7   | PATCH  | `/api/papertovideo/:run_id/script/images`      | _Optional_ — assign images to slides | pdf_extract + script_gen |
| 8   | GET    | `/api/papertovideo/:run_id/script`             | After `script_gen` completes         | script_gen               |
| 9a  | PUT    | `/api/papertovideo/:run_id/script`             | _Optional_ — edit script             | script_gen               |
| 9b  | POST   | `/api/papertovideo/:run_id/script/confirm`     | After review/edit                    | script_gen               |
| 10  | GET    | `/api/papertovideo/:run_id/slides`             | After `beamer_compile` completes     | script/confirm           |
| 11  | GET    | `/api/papertovideo/:run_id/audio`              | After `audio_gen` completes          | script/confirm           |
| 12  | GET    | `/api/papertovideo/:run_id/audio/:slide_index` | After `audio_gen` completes          | audio_gen                |
| 13  | GET    | `/api/papertovideo/:run_id/download`           | After `ffmpeg_stitch` completes      | both #10 and #11         |
| 14a | POST   | `/api/paper/:paper_id/business-brief`          | Start business brief generation      | extracted paper text     |
| 14b | GET    | `/api/paper/:paper_id/business-brief`          | Poll brief status/content            | 14a                      |
| 14c | PUT    | `/api/paper/:paper_id/business-brief`          | Optional brief text edits            | 14b                      |
| 14d | GET    | `/api/paper/:paper_id/business-brief/pdf`      | Download brief PDF                   | brief completed          |
| 14e | GET    | `/api/paper/:paper_id/business-brief/stream`   | Live brief SSE updates               | 14a                      |

---

# API Routes Reference

## Public Routes

```
GET  /health
     Response: { "status": "ok" }

GET  /api/templates
     Response: [{ "id": "sampleppt", "name": "Sample PPT Template" }, { "id": "template-saral", "name": "SARAL Template" }]

GET  /api/voices
     Response: { "male": ["aditya","shubh","aayan"], "female": ["simran","roopa","ishita"], "default": "female",
                 "note": "Pass voice_gender in POST /script/confirm. One speaker selected for the whole run." }

GET  /api/languages
     Response: { "supported": [{ "code": "en-IN", "name": "English (India)", "tts": "sarvam-direct" },
                               { "code": "hi-IN", "name": "Hindi", "tts": "bhashini-mt+sarvam" }, ...],
                 "default": "en-IN",
                 "note": "Pass as 'language' in PUT /script or POST /script/confirm. Controls BOTH slide text translation (beamer) AND audio TTS language." }

POST /auth/login
     Request:  { "token": "<firebase_id_token>" }
     Response: { "access_token", "token_type", "expires_in", "user": { id, email, firebase_uid } }

POST /auth/logout
     Response: { "message": "Logged out successfully" }

POST /webhooks/worker/:service
     Internal service-to-service only (no auth middleware).
     Request:  { "run_id", "step_id", "step_name", "status", "gcs_output_path", "error_message", "next_step" }
     Response: { "success": true }
     Called by: script-gen, audio-gen, beamer, ffmpeg-job, pdf-parser workers.
```

---

## Protected Routes

All require `Authorization: Bearer <access_token>`.

### Auth Info

```
GET /api/auth/me
    Response: { "id": uuid, "email": string, "firebase_uid": string, "created_at": timestamp }

GET /api/auth/verify
    Response: { "id": uuid, "email": string, "firebase_uid": string, "valid": true }
```

### Pipeline — Upload & Monitor

```
POST /api/papertovideo/upload
     Body: multipart/form-data  key=pdf
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertovideo/:run_id/status
     Response: run object with steps[] array

GET  /api/papertovideo/:run_id/stream
     Response: text/event-stream (SSE)
     Events:   { "step": string, "status": "processing|completed|failed", "message": string }
```

### Pipeline — Extracted Content

```
GET  /api/papertovideo/:run_id/extracted
     Requires: pdf_extract completed
     Response: { "text": string, "image_paths": [gcs_path], "metadata": { title, authors, page_count } }

GET  /api/papertovideo/:run_id/images
     Requires: pdf_extract completed
     Response: { "images": [{ "index": int, "url": presigned_http_url, "gcs_path": "gs://..." }], "expires_in": 3600 }
```

### Pipeline — Script (Human-in-the-Loop)

```
GET  /api/papertovideo/:run_id/script
     Requires: script_gen completed
     Response: full Script object (see schema below)

PUT  /api/papertovideo/:run_id/script
     Requires: script_gen completed
     Body:     full Script object (see Step 9a for copy-paste sample)
     Response: { "message": "script updated" }

PATCH /api/papertovideo/:run_id/script/images
     Requires: pdf_extract + script_gen completed
     Body:     { "assignments": { "<section_id>": <image_index_int> } }
     Response: { "message": "image assignments saved", "image_assignments": { "<section_id>": "gs://..." } }
     Note:     image_index is 0-based from GET /images. Only listed sections updated.

POST /api/papertovideo/:run_id/script/confirm
     Requires: script_gen completed
     Body (all optional): { "output_format": "beamer_pdf"|"ppt",
                            "ppt_template": "sampleppt"|"template-saral",
                            "voice_gender": "male"|"female",
                            "language": "<BCP-47>" }
     Response: { "message": "beamer_compile and audio_gen started in parallel", "next_steps": [...] }
     Effect:   patches script with overrides then enqueues beamer_compile AND audio_gen in parallel
     Note:     "language" controls BOTH slide text translation (beamer) AND audio TTS language (audio_gen).
```

### Script Object Schema

```json
{
  "run_id": "uuid",
  "audience_level": "novice | intermediate | expert",
  "title": "string — real paper title extracted by Gemini (shown on title slide)",
  "authors": "string — paper authors extracted by Gemini",
  "date": "string — publication date extracted by Gemini",
  "title_intro": "string — spoken narration for the title slide",
  "language": "en-IN | hi-IN | bn-IN | ta-IN | te-IN | kn-IN | ml-IN | mr-IN | gu-IN | pa-IN | od-IN",
  "output_format": "beamer_pdf | ppt",
  "ppt_template": "sampleppt | template-saral (only when output_format=ppt)",
  "voice_gender": "male | female",
  "image_assignments": {
    "<section-id>": "gs://bucket/path/to/figure.png"
  },
  "sections": [
    {
      "id": "introduction | methodology | results | discussion | conclusion",
      "title": "string — slide heading (Bhashini-translated in non-English mode)",
      "summary": "string — speaker notes only, not shown on slide",
      "narration": "string — full spoken narration for TTS",
      "bullets": ["string — Bhashini-translated in non-English mode"]
    }
  ]
}
```

### Pipeline — Presentation Artifacts

```
GET  /api/papertovideo/:run_id/slides
     Requires: beamer_compile completed
     Response: { "slides_pdf_url": presigned_http_url, "expires_in": 3600 }

GET  /api/papertovideo/:run_id/audio
     Requires: audio_gen completed
     Response: { "run_id": uuid, "slides": [{ "frame_index": int, "audio_paths": [gcs_path] }] }

GET  /api/papertovideo/:run_id/audio/:slide_index
     Requires: audio_gen completed
     Param:    slide_index — 0-based integer (0 = title slide)
     Response: { "slide_index": int, "audio_urls": [presigned_http_url], "expires_in": 3600 }

GET  /api/papertovideo/:run_id/download
     Requires: ffmpeg_stitch completed
     Response: { "url": presigned_http_url, "expires_in": 3600 }
```

### Business Brief (Paper-Level Artifact)

Business Brief is scoped to a `paper_id` (not `run_id`).

```
POST /api/paper/:paper_id/business-brief
     Purpose: enqueue generation (Gemini + PDF render)
     Body (optional):
       {
         "model_version": "v1" | "v2"
       }
     Notes:
       - If body is omitted or model_version is invalid, worker default is used.
       - Returns 202 Accepted because generation runs async.
     Response:
       {
         "success": true,
         "data": {
           "id": "brief-uuid",
           "paper_id": "paper-uuid",
           "status": "processing",
           "message": "Business brief generation started"
         }
       }

GET  /api/paper/:paper_id/business-brief
     Purpose: fetch current brief state + content
     Response:
       {
         "success": true,
         "data": {
           "id": "brief-uuid",
           "paper_id": "paper-uuid",
           "user_id": "user-uuid",
           "status": "processing|completed|failed",
           "sections": {
             "overview": "...",
             "business_impact": "...",
             "implementation": "...",
             "risks": "...",
             "conclusion": "..."
           },
           "model_version": "v1|v2",
           "json_gcs_path": "gs://.../business_brief.json",
           "pdf_gcs_path": "gs://.../business_brief.pdf",
           "error_message": "...",
           "created_at": "2026-04-27T11:30:00Z",
           "updated_at": "2026-04-27T11:31:45Z"
         }
       }

PUT  /api/paper/:paper_id/business-brief
     Purpose: merge user edits into sections, then async PDF re-render
     Body (required):
       {
         "sections": {
           "overview": "edited text",
           "risks": "edited text"
         }
       }
     Notes:
       - Partial updates are merged over existing sections.
       - Response is immediate; PDF refresh happens in background.
     Response:
       {
         "success": true,
         "data": {
           "id": "brief-uuid",
           "paper_id": "paper-uuid",
           "sections": {
             "overview": "edited text",
             "business_impact": "existing text",
             "implementation": "existing text",
             "risks": "edited text",
             "conclusion": "existing text"
           },
           "status": "processing"
         }
       }

GET  /api/paper/:paper_id/business-brief/pdf
     Purpose: get presigned PDF URL
     Response:
       {
         "success": true,
         "data": {
           "url": "https://...presigned"
         }
       }

GET  /api/paper/:paper_id/business-brief/stream
     Purpose: real-time SSE updates for brief generation
     Response type: text/event-stream
     Event shape:
       {
         "step": "business_brief",
         "status": "processing|completed|failed",
         "message": "Generating business brief... | Business brief is ready | <error>"
       }
     Notes:
       - If the brief is already completed/failed when connecting, server sends
         one terminal event and closes.
       - Recommended to keep this stream open after POST /business-brief.
```

#### Business Brief Error Cases

```
POST /api/paper/:paper_id/business-brief
  400 invalid_paper_id
  404 paper_not_found
  409 paper_not_ready
  500 db_error | enqueue_failed

GET /api/paper/:paper_id/business-brief
  400 invalid_paper_id
  404 brief_not_found
  500 db_error

PUT /api/paper/:paper_id/business-brief
  400 invalid_paper_id | invalid_request
  404 brief_not_found
  500 db_error

GET /api/paper/:paper_id/business-brief/pdf
  400 invalid_paper_id
  404 brief_not_found
  409 pdf_not_ready
  500 presign_failed
```

---

## Pipeline State Machine

```
upload
  └─→ pdf_extract (processing)
        └─→ pdf_extract (completed)
              └─→ script_gen (processing)
                    └─→ script_gen (completed)
                          │
                          │  ← pipeline pauses here; user calls GET /script,
                          │    optionally PUT /script, then POST /script/confirm
                          │
                          └─→ POST /script/confirm
                                ├─→ beamer_compile (processing) ─┐  run in parallel
                                └─→ audio_gen (processing)      ─┘
                                      │
                                      │  (both must complete before ffmpeg starts)
                                      │
                                      └─→ ffmpeg_stitch (processing)
                                              └─→ ffmpeg_stitch (completed)
                                                    └─→ pipeline: completed
```

---

## Local Dev Tips

### Bypass Firebase Auth

In local dev, pass `X-User-ID` header instead of `Authorization`:

```
X-User-ID: my-local-user
```

The gateway will use this string as `firebase_uid` and create a `@local.dev` email automatically.

### Watch SSE with curl

```bash
export TOKEN="your-jwt-token"
export RUN_ID="a1b2c3d4-..."

curl -N http://localhost:8080/api/papertovideo/$RUN_ID/stream \
  -H "Authorization: Bearer $TOKEN"
```

### Full pipeline smoke test (bash)

```bash
export BASE=http://localhost:8080
export TOKEN="<your-token>"

# 1. Upload
RESP=$(curl -s -X POST $BASE/api/papertovideo/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "pdf=@paper.pdf")
RUN_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['run_id'])")
echo "run_id: $RUN_ID"

# 2. Stream (background)
curl -sN $BASE/api/papertovideo/$RUN_ID/stream -H "Authorization: Bearer $TOKEN" &
STREAM_PID=$!

# 3. Poll until script_gen completes
while true; do
  STEP=$(curl -s $BASE/api/papertovideo/$RUN_ID/status \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['current_step'])")
  echo "step: $STEP"
  [[ "$STEP" == "script_gen" ]] && break
  sleep 5
done

# 4. Confirm (no edits)
curl -s -X POST $BASE/api/papertovideo/$RUN_ID/script/confirm \
  -H "Authorization: Bearer $TOKEN" -d '{}'

# 5. Wait for completion, then download
while true; do
  STATUS=$(curl -s $BASE/api/papertovideo/$RUN_ID/status \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  [[ "$STATUS" == "completed" ]] && break
  sleep 5
done

URL=$(curl -s $BASE/api/papertovideo/$RUN_ID/download \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['url'])")
curl -L "$URL" -o output.mp4
echo "Downloaded output.mp4"
kill $STREAM_PID
```

---

## Response Envelope

### Success

```json
{ "success": true, "data": { ... } }
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND | UNAUTHORIZED | INVALID_REQUEST | INTERNAL_ERROR",
    "message": "Human-readable description"
  }
}
```

## HTTP Status Codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 200  | Success                                    |
| 202  | Accepted (upload — pipeline started async) |
| 400  | Bad request / validation error             |
| 401  | Missing or invalid token                   |
| 404  | run_id not found or step not completed yet |
| 500  | Internal server error                      |

## CORS Headers (all responses)

```
Access-Control-Allow-Origin:  *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-User-ID
```
