# SARAL Backend — API Routes Reference

**Base URL (local dev):** `http://localhost:8080`

All protected routes require `Authorization: Bearer <access_token>`.

Local dev shortcut — pass `X-User-ID: <any-string>` instead of `Authorization` to bypass Firebase. The gateway uses it as `firebase_uid` and auto-creates a `@local.dev` account.

---

## Public Routes

```
GET  /health
     Response: { "status": "ok" }

GET  /api/templates
     Response: [{ "id": "template-saral", "name": "SARAL Template" },
                { "id": "sampleppt", "name": "Sample PPT Template" }]

GET  /api/voices
     Response: { "male": ["aditya","shubh","aayan"],
                 "female": ["simran","roopa","ishita"],
                 "default": "female",
                 "note": "..." }

GET  /api/languages
     Response: { "supported": [{ "name": "English",              "code": "en-IN",  "translation": "none",               "tts": "sarvam-bulbul-v3" },
                               { "name": "Hindi",                "code": "hi-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Bengali",              "code": "bn-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Tamil",                "code": "ta-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Telugu",               "code": "te-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Kannada",              "code": "kn-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Malayalam",            "code": "ml-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Marathi",              "code": "mr-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Gujarati",             "code": "gu-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Punjabi",              "code": "pa-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Odia",                 "code": "od-IN",  "translation": "sarvam-mayura-v1",   "tts": "sarvam-bulbul-v3" },
                               { "name": "Assamese",             "code": "as-IN",  "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Bodo",                 "code": "brx-IN", "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Dogri",                "code": "doi-IN", "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Maithili",             "code": "mai-IN", "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Manipuri",             "code": "mni-IN", "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Sanskrit",             "code": "sa-IN",  "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Santali",              "code": "sat-IN", "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Urdu",                 "code": "ur-IN",  "translation": "sarvam-translate-v1","tts": "bhashini" },
                               { "name": "Portuguese (Brazil)",  "code": "pt-BR",  "translation": "gemini",             "tts": "gemini-tts" },
                               { "name": "Portuguese (Portugal)","code": "pt-PT",  "translation": "gemini",             "tts": "gemini-tts" }],
                 "default": "English",
                 "note": "Pass the 'name' value (e.g. 'Hindi') as the 'language' field. BCP-47 codes also accepted." }
```

---

## Auth Routes (Public)

### Firebase / OAuth login

```
POST /auth/login
     Request:  { "token": "<firebase_id_token>" }
     Response: { "success": true, "data": { "access_token", "token_type": "Bearer",
                  "expires_in": 3600, "user": { "id", "email", "firebase_uid" } } }
     Errors:   400 token_required
               401 invalid_firebase_token

POST /auth/logout
     Response: { "success": true, "data": { "message": "Logged out successfully" } }
```

### Email / Password

```
POST /auth/email/signup
     Request:  { "email": string, "password": string, "display_name"?: string }
     Response: { "success": true, "data": { "access_token", "token_type", "expires_in", "user": { ... } } }
     Errors:   400 email_required | password_required | display_name_too_long
               400 password_too_short | password_too_long | password_too_common
               400 password_contains_email | password_repeated_chars | password_no_letter
               409 email_already_exists

POST /auth/email/signin
     Request:  { "email": string, "password": string }
     Response: { "success": true, "data": { "access_token", "token_type", "expires_in", "user": { ... } } }
     Errors:   400 email_required | password_required
               401 invalid_credentials

POST /auth/email/forgot-password
     Request:  { "email": string }
     Response: { "success": true, "data": { "message": "If that address is registered you will receive a reset email" } }

POST /auth/email/reset-password
     Request:  { "oob_code": string, "new_password": string }
     Response: { "success": true, "data": { "message": "Password reset successfully" } }
     Errors:   400 oob_code_required | new_password_required | <password policy violations>
               400 invalid_oob_code (expired or already used)
```

### OAuth (Chrome Extension)

```
POST /auth/oauth/google
     Purpose:  Exchange a Google OAuth access token for a SARAL JWT (Chrome extension flow)
     Request:  { "access_token": "<google-oauth-access-token>" }
     Response: { "success": true, "data": { "access_token", "token_type",
                  "user": { "id", "firebase_uid", "email", "provider": "google.com" } } }
     Errors:   503 firebase_not_initialized
               400 access_token_required
               401 google_exchange_failed
```

### Social OAuth Callbacks (browser redirect — no Firebase token)

```
GET /auth/social/youtube/callback
    Query params: code, state
    Effect:       exchanges code for YouTube tokens, stores in DB, closes OAuth window

GET /auth/social/linkedin/callback
    Query params: code, state
    Effect:       exchanges code for LinkedIn tokens, stores in DB, closes OAuth window
```

### Internal Webhook (service-to-service, no auth)

```
POST /webhooks/worker/:service
     :service values: pdf_extract | script_gen | audio_gen | beamer_compile | ffmpeg_stitch |
                      poster | podcast | reel | social_post | business_brief
     Request:  { "run_id", "step_id", "step_name", "status", "gcs_output_path",
                 "error_message", "next_step" }
     Response: { "success": true }
```

---

## Protected Routes

All routes below require `Authorization: Bearer <access_token>`.

### User / Account

```
GET /api/auth/me
    Response: { "id", "email", "firebase_uid", "created_at" }
    Errors:   401 missing/invalid token

GET /api/auth/verify
    Response: { "id", "email", "firebase_uid", "valid": true }
    Errors:   401 missing/invalid token

GET /api/auth/providers
    Response: list of linked OAuth providers for the current user

GET /api/user/keys
    Response: { "gemini_key"?: string, "sarvam_key"?: string }

PUT /api/user/keys
    Request:  { "gemini_key"?: string, "sarvam_key"?: string }
    Response: { "message": "keys saved" }
    Note:     User-supplied API keys override the server defaults for their requests.
```

---

## Paper → Video Pipeline (`/api/papertovideo`)

The primary pipeline: PDF → script → slides + audio → video MP4.

```
GET  /api/papertovideo/papers
     Response: { "papers": [{ "id", "user_id", "gcs_source_path", "title", "authors",
                               "date", "created_at" }], "count": int }
     Note:     title/authors/date populated after script_gen completes.

POST /api/papertovideo/upload
     Body:     multipart/form-data  key=pdf
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertovideo/:run_id/status
     Response: Status object (see Shared Schemas)

GET  /api/papertovideo/:run_id/stream
     Response: text/event-stream (SSE)
     Events:   { "step": string, "status": "processing|completed|failed", "message": string }

GET  /api/papertovideo/:run_id/extracted
     Requires: pdf_extract completed
     Response: { "text": string, "image_paths": [gcs_path], "metadata": { title, authors, page_count } }

GET  /api/papertovideo/:run_id/images
     Requires: pdf_extract completed
     Response: { "images": [{ "index": int, "url": presigned_url, "gcs_path": string }], "expires_in": 3600 }

GET  /api/papertovideo/:run_id/script
     Requires: script_gen completed
     Response: Script object (see Shared Schemas)

PUT  /api/papertovideo/:run_id/script
     Body:     Script object
     Response: { "message": "script updated" }

PATCH /api/papertovideo/:run_id/script/images
     Body:     { "assignments": { "<section_id>": <image_index_int> } }
     Response: { "message": "image assignments saved", "image_assignments": { "<section_id>": "gs://..." } }
     Note:     0-based index from GET /images. Only listed sections updated.

POST /api/papertovideo/:run_id/script/confirm
     Body (all optional): { "output_format": "beamer_pdf"|"ppt",
                            "ppt_template": "sampleppt"|"template-saral",
                            "voice_gender": "male"|"female",
                            "language": "<name or BCP-47>" }
     Response: { "message": "beamer_compile and audio_gen started in parallel",
                 "next_steps": ["beamer_compile", "audio_gen"] }
     Effect:   kicks off beamer_compile AND audio_gen in parallel

POST /api/papertovideo/:run_id/generate-video
     Purpose:  re-trigger ffmpeg_stitch when slides and audio are already ready
     Response: { "message": "video generation started" }

POST /api/papertovideo/:run_id/retry
     Purpose:  retry a failed or stuck run from its last checkpoint
     Response: { "ok": bool, "resumed": bool, "message": string }

GET  /api/papertovideo/:run_id/slides
     Requires: beamer_compile completed
     Response: { "slides_pdf_url": presigned_url, "expires_in": 3600 }

GET  /api/papertovideo/:run_id/audio
     Requires: audio_gen completed
     Response: { "run_id", "slides": [{ "frame_index": int, "audio_paths": [gcs_path] }] }

GET  /api/papertovideo/:run_id/audio/:slide_index
     Requires: audio_gen completed
     Response: { "slide_index": int, "audio_urls": [presigned_url], "expires_in": 3600 }

GET  /api/papertovideo/:run_id/download
     Requires: ffmpeg_stitch completed
     Response: { "url": presigned_url, "expires_in": 3600 }
     Note:     forces file download (Content-Disposition: attachment)

GET  /api/papertovideo/:run_id/video
     Requires: ffmpeg_stitch completed
     Response: streams video/mp4 with Range header support (in-browser playback)

POST /api/papertovideo/:run_id/social/linkedin
     Purpose:  generate a LinkedIn draft post for this run
     Response: { "message": "LinkedIn draft generation started" }

GET  /api/papertovideo/:run_id/social/linkedin
     Response: { "draft": string, "status": "processing|completed|failed" }

POST /api/papertovideo/:run_id/social/twitter
     Purpose:  generate an X/Twitter draft post for this run
     Response: { "message": "Twitter draft generation started" }

GET  /api/papertovideo/:run_id/social/twitter
     Response: { "draft": string, "status": "processing|completed|failed" }

POST /api/papertovideo/:run_id/share/youtube
     Purpose:  upload finished video to the user's connected YouTube channel
     Body:     { "title"?: string, "description"?: string, "privacy"?: "public|unlisted|private" }
     Response: { "youtube_url": string }
     Requires: YouTube connection via GET /api/social/youtube/auth

POST /api/papertovideo/:run_id/share/linkedin
     Purpose:  post finished video to the user's connected LinkedIn profile
     Body:     { "commentary"?: string }
     Response: { "linkedin_post_id": string }
     Requires: LinkedIn connection via GET /api/social/linkedin/auth
```

---

## Paper → Slides Pipeline (`/api/papertoslides`)

Produces slides only (PDF + deck preview images) — no audio or video.

```
POST /api/papertoslides/start
     Body:     multipart/form-data  key=pdf
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertoslides/:run_id/status
GET  /api/papertoslides/:run_id/stream          (SSE)
GET  /api/papertoslides/:run_id/images

GET  /api/papertoslides/:run_id/script
PUT  /api/papertoslides/:run_id/script
PATCH /api/papertoslides/:run_id/script/images
     (same request/response shape as papertovideo equivalents)

POST /api/papertoslides/:run_id/template
     Body:     multipart/form-data  key=template  (custom .pptx file)
     Response: { "message": "template uploaded" }

POST /api/papertoslides/:run_id/confirm
     Body (all optional): { "output_format": "beamer_pdf"|"ppt",
                            "ppt_template": "sampleppt"|"template-saral"|"custom",
                            "language": "<name or BCP-47>" }
     Response: { "message": "beamer_compile started" }

GET  /api/papertoslides/:run_id/slides
     Response: { "slides_pdf_url": presigned_url, "expires_in": 3600 }

GET  /api/papertoslides/:run_id/deck
     Response: { "deck": [{ "index": int, "url": presigned_url }], "expires_in": 3600 }
     Note:     individual slide preview PNGs, one per slide
```

---

## Paper → Poster Pipeline (`/api/papertoposter`)

Produces a single-page academic poster (PDF).

```
POST /api/papertoposter/start
     Body:     multipart/form-data  key=pdf
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertoposter/:run_id/status
GET  /api/papertoposter/:run_id/stream          (SSE)

GET  /api/papertoposter/:run_id/content
     Requires: poster content generation completed
     Response: poster content JSON (sections, figures, layout metadata)

POST /api/papertoposter/:run_id/confirm
     Body (optional): { "language"?: string }
     Response: { "message": "poster generation started" }

GET  /api/papertoposter/:run_id/download
     Response: { "url": presigned_url, "expires_in": 3600 }

POST /api/papertoposter/:run_id/retry
     Response: { "ok": bool, "resumed": bool, "message": string }
```

---

## Paper → Podcast Pipeline (`/api/papertopodcast`)

Produces an audio podcast and an optional audiogram video.

```
POST /api/papertopodcast/start
     Body:     multipart/form-data  key=pdf
               Optional fields: voice_gender, language
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertopodcast/:run_id/status
GET  /api/papertopodcast/:run_id/stream          (SSE)

GET  /api/papertopodcast/:run_id/script
     Response: podcast script JSON

GET  /api/papertopodcast/:run_id/audio
     Response: { "url": presigned_url, "expires_in": 3600 }

GET  /api/papertopodcast/:run_id/download
     Response: { "url": presigned_url, "expires_in": 3600 }
     Note:     forces Content-Disposition: attachment

GET  /api/papertopodcast/:run_id/video
     Response: streams video/mp4 (audiogram-style with waveform)

POST /api/papertopodcast/:run_id/retry
     Response: { "ok": bool, "resumed": bool, "message": string }
```

---

## Paper → Reel Pipeline (`/api/papertoreel`)

Produces a short vertical video reel with an AI avatar.

```
POST /api/papertoreel/start
     Body:     multipart/form-data  key=pdf
               Optional fields: language, voice_gender
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/papertoreel/:run_id/status
GET  /api/papertoreel/:run_id/stream             (SSE)

GET  /api/papertoreel/avatars
     Response: { "avatars": [{ "id": string, "name": string, "preview_url": presigned_url }] }
     Note:     no :run_id — avatars are global

GET  /api/papertoreel/:run_id/script
PUT  /api/papertoreel/:run_id/script
     (reel-specific script schema — shorter narration + key bullets)

POST /api/papertoreel/:run_id/avatars
     Body:     { "avatar_id": string }
     Response: { "message": "avatar selected" }

POST /api/papertoreel/:run_id/finalize
     Body (optional): { "voice_gender"?: "male"|"female", "language"?: string }
     Response: { "message": "reel generation started" }

GET  /api/papertoreel/:run_id/download
     Response: { "url": presigned_url, "expires_in": 3600 }

GET  /api/papertoreel/:run_id/video
     Response: streams video/mp4 with Range support

POST /api/papertoreel/:run_id/retry
     Response: { "ok": bool, "resumed": bool, "message": string }
```

---

## Patent → Video Pipeline (`/api/patenttovideo`)

Same stages as Paper → Video but script-gen uses a patent-specific prompt.

```
POST /api/patenttovideo/upload
     Body:     multipart/form-data  key=pdf
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }

GET  /api/patenttovideo/:run_id/status
GET  /api/patenttovideo/:run_id/stream           (SSE)
GET  /api/patenttovideo/:run_id/script
PUT  /api/patenttovideo/:run_id/script
PATCH /api/patenttovideo/:run_id/script/images

POST /api/patenttovideo/:run_id/script/confirm
     Body (all optional): { "output_format", "ppt_template", "voice_gender", "language" }

POST /api/patenttovideo/:run_id/generate-video

GET  /api/patenttovideo/:run_id/slides
GET  /api/patenttovideo/:run_id/audio
GET  /api/patenttovideo/:run_id/download
GET  /api/patenttovideo/:run_id/video

POST /api/patenttovideo/:run_id/retry
```

---

## ArXiv / BioRxiv / MedRxiv Ingest

```
POST /api/papers/arxiv
     Body:     { "url": "<arxiv.org | biorxiv.org | medrxiv.org URL>" }
     Response: { "run_id", "paper_id", "user_id", "stream_url", "status_url" }
     Note:     gateway fetches the PDF from the preprint server and feeds it into
               the same pipeline as a normal upload. All /api/papertovideo/:run_id/*
               routes work identically after this.
```

---

## Business Brief

Scoped to a `paper_id`. Can be triggered independently of the video pipeline once pdf_extract has completed.

```
POST /api/paper/:paper_id/business-brief
     Body (optional): { "model_version": "v1"|"v2" }
     Response: { "id", "paper_id", "status": "processing", "message": "Business brief generation started" }
     Errors:   400 invalid_paper_id | 404 paper_not_found | 409 paper_not_ready | 500 db_error | enqueue_failed

GET  /api/paper/:paper_id/business-brief
     Response: { "id", "paper_id", "user_id", "status": "processing|completed|failed",
                 "sections": { "overview", "business_impact", "implementation", "risks", "conclusion" },
                 "model_version", "json_gcs_path", "pdf_gcs_path", "error_message",
                 "created_at", "updated_at" }
     Errors:   400 invalid_paper_id | 404 brief_not_found | 500 db_error

PUT  /api/paper/:paper_id/business-brief
     Body:     { "sections": { "<section_name>": "edited text" } }
     Note:     partial update — only listed sections replaced; triggers async PDF re-render
     Response: { "id", "paper_id", "sections": { ... merged ... }, "status": "processing" }
     Errors:   400 invalid_paper_id | invalid_request | 404 brief_not_found | 500 db_error

GET  /api/paper/:paper_id/business-brief/pdf
     Response: { "url": presigned_url }
     Errors:   400 invalid_paper_id | 404 brief_not_found | 409 pdf_not_ready | 500 presign_failed

GET  /api/paper/:paper_id/business-brief/stream
     Response: text/event-stream (SSE)
     Events:   { "step": "business_brief", "status": "processing|completed|failed", "message": string }
     Note:     if already completed/failed when connecting, server sends one terminal event and closes
```

---

## Social Connections

```
GET  /api/social/youtube/auth
     Purpose:  initiate YouTube OAuth — returns redirect URL for the user to visit
     Response: { "auth_url": string }

GET  /api/social/linkedin/auth
     Purpose:  initiate LinkedIn OAuth — returns redirect URL for the user to visit
     Response: { "auth_url": string }

GET  /api/social/status
     Response: { "youtube":  { "connected": bool, "channel_name"?: string },
                 "linkedin": { "connected": bool, "profile_name"?: string } }
```

---

## Shared Object Schemas

### Script Object (papertovideo / papertoslides / patenttovideo)

```json
{
  "run_id": "uuid",
  "audience_level": "novice | intermediate | expert",
  "title": "string",
  "authors": "string",
  "date": "string",
  "title_intro": "string — spoken narration for the title slide",
  "language": "English | Hindi | ... (name)  OR  en-IN | hi-IN | ... (BCP-47)",
  "output_format": "beamer_pdf | ppt",
  "ppt_template": "sampleppt | template-saral | custom",
  "voice_gender": "male | female",
  "image_assignments": { "<section-id>": "gs://bucket/path/to/figure.png" },
  "sections": [
    {
      "id": "introduction | methodology | results | discussion | conclusion",
      "title": "string",
      "summary": "string — speaker notes only, not shown on slide",
      "narration": "string — full TTS narration",
      "bullets": ["string"]
    }
  ]
}
```

### Status Object

```json
{
  "id": "uuid",
  "paper_id": "uuid",
  "user_id": "uuid",
  "status": "processing | completed | failed",
  "current_step": "string",
  "error_message": null,
  "started_at": "ISO8601",
  "updated_at": "ISO8601",
  "completed_at": "ISO8601 | null",
  "steps": [
    {
      "name": "string",
      "status": "pending | processing | completed | failed",
      "started_at": "ISO8601 | null",
      "completed_at": "ISO8601 | null"
    }
  ]
}
```

---

## Response Envelope

```json
{ "success": true, "data": { ... } }
```

```json
{
  "success": false,
  "error": { "code": "SNAKE_CASE_CODE", "message": "Human-readable description" }
}
```

## HTTP Status Codes

| Code | Meaning                             |
| ---- | ----------------------------------- |
| 200  | Success                             |
| 202  | Accepted (async job enqueued)       |
| 400  | Bad request / validation error      |
| 401  | Missing or invalid token            |
| 404  | Resource not found or not yet ready |
| 409  | Conflict (e.g. artifact not ready)  |
| 500  | Internal server error               |

## CORS Headers (all responses)

```
Access-Control-Allow-Origin:  *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-User-ID
```

---

## Pipeline State Machines

### Paper → Video / Patent → Video

```
upload (or /papers/arxiv)
  └─→ pdf_extract
        └─→ script_gen
              │  ← pauses; user may GET/PUT script, then POST /script/confirm
              └─→ POST /script/confirm
                    ├─→ beamer_compile ─┐  parallel
                    └─→ audio_gen      ─┘
                          └─→ ffmpeg_stitch
                                └─→ pipeline: completed
```

### Paper → Slides

```
start
  └─→ pdf_extract → script_gen
        │  ← pauses; user may GET/PUT script, POST /template, then POST /confirm
        └─→ POST /confirm → beamer_compile → pipeline: completed
```

### Paper → Poster

```
start
  └─→ pdf_extract → poster_content_gen
        │  ← pauses; user may GET /content, then POST /confirm
        └─→ POST /confirm → poster_render → pipeline: completed
```

### Paper → Podcast

```
start → pdf_extract → script_gen → audio_gen → [ffmpeg_stitch] → pipeline: completed
```

### Paper → Reel

```
start
  └─→ pdf_extract → script_gen
        │  ← pauses; user may GET/PUT script, POST /avatars, then POST /finalize
        └─→ POST /finalize → reel_render → pipeline: completed
```

---

## Local Dev Tips

### Watch SSE with curl

```bash
export TOKEN="your-jwt-token"
export RUN_ID="a1b2c3d4-..."

curl -N http://localhost:8080/api/papertovideo/$RUN_ID/stream \
  -H "Authorization: Bearer $TOKEN"
```

### Full video pipeline smoke test (bash)

```bash
export BASE=http://localhost:8080
export TOKEN="<your-token>"

RESP=$(curl -s -X POST $BASE/api/papertovideo/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "pdf=@paper.pdf")
RUN_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['run_id'])")
echo "run_id: $RUN_ID"

curl -sN $BASE/api/papertovideo/$RUN_ID/stream -H "Authorization: Bearer $TOKEN" &
STREAM_PID=$!

while true; do
  STEP=$(curl -s $BASE/api/papertovideo/$RUN_ID/status \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['current_step'])")
  echo "step: $STEP"
  [[ "$STEP" == "script_gen" ]] && break
  sleep 5
done

curl -s -X POST $BASE/api/papertovideo/$RUN_ID/script/confirm \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

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
