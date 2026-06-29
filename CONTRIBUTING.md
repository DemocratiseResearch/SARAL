# Contributing to SARAL AI

Thank you for your interest in SARAL AI, a full stack platform that transforms academic papers into video presentations, podcasts, posters, business briefs and more left to the imagination of the OSS community to help democratise research to the masses.

This document outlines how to contribute, report issues, and work with the codebase. For local-dev instructions, see [README.md](README.md).

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Help](#getting-help)
- [Reporting Security Issues](#reporting-security-issues)
- [Development Setup](#development-setup)
- [Repository Layout](#repository-layout)
- [How We Work](#how-we-work)
- [Per-Area Development Workflow](#per-area-development-workflow)
- [Testing](#testing)
- [Style & Design Conventions](#style--design-conventions)
- [Commit Messages](#commit-messages)
- [Pull Request Checklist](#pull-request-checklist)
- [Secrets & Data Policy](#secrets--data-policy)
- [Issue Labels](#issue-labels)
- [License](#license)

---

## Code of Conduct

We are committed to fostering a welcoming and respectful community. Harassment, discrimination, or other unacceptable behaviour will not be tolerated. By participating, you agree to abide by the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## Getting Help

- **Bug reports / feature requests** — open a [GitHub Issue](https://github.com/anomalyco/saral/issues).
- **Quick questions** — start a [GitHub Discussion](https://github.com/anomalyco/saral/discussions).
- **Internal maintainers** — reach out on the IIIT Hyderabad SARAL team channel.

---

## Reporting Security Issues

If you discover a security vulnerability, **do not** open a public issue. Instead, email the maintainers directly or use GitHub's private vulnerability reporting feature. We will acknowledge and respond within 48 hours.

---

## Development Setup

See the complete [README.md](README.md) for full setup instructions. In short:

1. Install the toolchain (Go ≥ 1.25, Python 3.11, Node ≥ 20, Docker).
2. Start infrastructure: `docker compose -f backend/docker-compose.yml up -d`.
3. Create `backend/.env.shared`, `backend/gateway/.env`, and `frontend/.env.local`.
4. Install per-worker deps and run `overmind start -f backend/Procfile.dev`.

---

## Repository Layout

```
saral/
├── backend/
│   ├── gateway/                 Go REST API + orchestrator (port 8080)
│   ├── services/
│   │   ├── pdf-parser/          Python — PDF text/image extraction
│   │   ├── beamer/              Python — LaTeX slides + posters (2 processes)
│   │   ├── ffmpeg-job/          Python — video/podcast/reel stitching
│   │   ├── script-gen/          Go — Gemini / Vertex / OpenRouter script generation
│   │   ├── audio-gen/           Go — TTS via Sarvam / Bhashini / Gemini
│   │   └── shared/              Python shared library (saral_shared)
│   ├── migrations/              SQL migrations (apply in order)
│   ├── Saral API Collection/    Bruno/Postman API collection files
│   ├── docker-compose.yml       Postgres + Redis + fake-GCS
│   ├── Procfile.dev             Overmind process definitions
│   ├── .env.shared              Shared config for all workers
│   └── ARCHITECTURE.md          System design & data flow
└── frontend/
    ├── app/                     Next.js 16 App Router pages
    ├── components/              shadcn UI, dashboard, modals, etc.
    ├── lib/                     API client, zustand stores, Firebase, types
    ├── .env.example             Template — copy to .env.local
    └── .env.local               Local config (gitignored)
```

---

## How We Work

- **Branch naming** — `feat/short-description`, `fix/issue-description`, `chore/task-name`.
- **One change per branch** — keep pull requests focused on a single concern.
- **Draft PRs early** — open a draft PR as soon as you start; mark it ready when CI passes and review is requested.
- **UI changes require screenshots** — attach before/after screenshots or a screen recording to the PR description.
- **Update docs** — if your change touches configuration, env vars, or endpoints, update [README.md](README.md) or the relevant `backend/` docs (`ROUTES.md`, `ARCHITECTURE.md`).

---

## Per-Area Development Workflow

Run these commands **before pushing** to ensure CI will pass.

### Backend — Go (gateway, script-gen, audio-gen)

```bash
# Gateway
cd backend/gateway && go mod tidy && go vet ./... && go build ./...

# Script-Gen worker
cd backend/services/script-gen && go mod tidy && go build ./...

# Audio-Gen worker
cd backend/services/audio-gen && go mod tidy && go build ./...
```

### Backend — Python (pdf-parser, beamer, ffmpeg-job, shared)

```bash
export UV_LINK_MODE=copy

for svc in pdf-parser beamer ffmpeg-job shared; do
  cd backend/services/$svc
  uv sync --python 3.11
  uv tool run ruff check .
  cd ../..
done
```

### Frontend (Next.js / TypeScript)

```bash
cd frontend

bun install               # or: npm install
bun run lint               # ESLint
npx tsc --noEmit           # TypeScript type-check
bun run build              # Production build
```

---

## Testing

Automated tests are currently sparse. We expect contributors to:

- Add **unit tests** for new Go/Python logic (place them in `*_test.go` / `test_*.py` files alongside the source).
- Add **integration tests** for new pipeline steps or API endpoints.
- **Manually smoke-test** your changes using the `curl` upload-and-stream flow described in [README.md § Verify](README.md#8-verify).

All tests must pass before a PR is merged.

---

## Style & Design Conventions

- **Go** — run `go vet ./...`; follow existing package layout (`internal/<pkg>`); use the `Provider` interface pattern from `script-gen/internal/gemini/` when adding new LLM backends.
- **Python** — `ruff` defaults; type hints are strongly encouraged for all public functions.
- **Frontend** — use shadcn components only (no raw HTML form controls); design tokens are defined in `app/globals.css` (`@theme inline`); dark-mode pairing rules and canonical form styles are documented in `frontend/CLAUDE.md` (read it before UI work).
- **SQL** — plain SQL in `backend/migrations/`; name files `NNNN_description.sql` where `NNNN` is the next sequence number.

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`.

**Examples:**

```
feat(gateway): add /api/user/keys endpoint for per-user API keys
fix(script-gen): handle OpenRouter 402 insufficient credits
docs(readme): add OpenRouter provider section
```

---

## Pull Request Checklist

Before opening or marking a PR as ready:

- [ ] Branch is up to date with `main`.
- [ ] Commits follow [Conventional Commits](#commit-messages).
- [ ] All linters pass (`go vet`, `ruff`, ESLint).
- [ ] TypeScript type-check passes (`npx tsc --noEmit`).
- [ ] Build succeeds (Go, Next.js).
- [ ] Manual smoke test completed (upload a paper, watch the pipeline).
- [ ] No secrets committed (verify with `git diff --cached`).
- [ ] UI changes include screenshots / screen recording.
- [ ] Corresponding docs updated (`README.md`, `ROUTES.md`, `ARCHITECTURE.md`, etc.).

---

## Secrets & Data Policy

- **Never commit** `.env*` files (except `.env.example`), `firebase-service-account.json`, `*firebase*.json`, or real API keys.
- Use placeholder values in `.env.shared` (comment out the real keys).
- Before staging, run `git diff --cached` and visually confirm no secrets.
- In your fork, keep a local-only `.env.shared.override` that you never stage.

---

## Issue Labels

| Label | Purpose |
|---|---|
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `good first issue` | Beginner-friendly task |
| `help wanted` | Maintainers seek community help |
| `area:backend` | Gateway, workers, infra |
| `area:frontend` | Next.js app, UI, design |

---

## License

By submitting a contribution, you agree that your work is licensed under the [MIT License](LICENSE) that covers this repository.
