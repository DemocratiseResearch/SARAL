# [Title — what changed, one line, verb first]
**Reviewer:** @handle
**Type:** `[ ] Feature` `[ ] Bug Fix` `[ ] Refactor` `[ ] Docs/Config` `[ ] Hotfix`
**Breaking change?** `[ ] Yes` `[ ] No`

> **Checkboxes:** change `[]` to `[x]` when done — or click them directly on GitHub.

---

## Summary

_What was the problem and what does this PR do about it. 3–4 lines._

---

## Rough Example / Context

_A snippet, a flow, a before/after — anything that gives the reviewer a mental model fast. Skip if the summary covers it._

---

## How to test locally

_Write this while you're still in the code. From a clean checkout. Include how to trigger the failure case, not just the happy path._

```bash
git checkout your-branch
npm install
npm run dev

# what to do / observe
# how to break it on purpose to test edge case
```

---

## Checklist

> Tick only what you've actually done.

### Always
- [] Read through my own diff on GitHub before raising this
- [] No commented-out code, `console.log`, or debug artifacts left in
- [] No hardcoded URLs, tokens, or env-specific strings — use `.env`
- [] If anything changed in how the project runs, README is updated

### Frontend
- [] Searched the codebase — this component doesn't already render somewhere else
- [] Tested error state, empty state, and loading state — not just the happy path
- [] Screenshots below for every visible change

### Backend / API
- [] Auth is enforced on new endpoints — no unprotected routes
- [] Inputs are validated — no raw user data hitting the DB or external services
- [] Errors return proper HTTP status codes 
- [] No sensitive data in responses — no stack traces, internal IDs, raw DB errors
- [] Rate limiting considered for any user-facing or polling-heavy endpoint
- [] Frontend handles backend being unreachable — no blank screens or silent failures

### Docs / Config
- [] New or changed env vars listed below
- [] Nothing sensitive committed — keys, tokens, internal URLs

---

## Screenshots _(required for any UI change)_

| Before | After |
|--------|-------|
| _paste_ | _paste_ |

---

## Env vars added or changed _(if any)_

| Variable | Required | What it does |
|----------|----------|--------------|
| `VITE_EXAMPLE` | Yes | ... |

---

## AI pre-review

_Request Copilot from the sidebar after raising. Come back, edit this description, and fill below once it responds._

- [ ] Done
- What it flagged: _..._
- What I fixed: _..._
- What I pushed back on (and why): _..._

---

## Anything the reviewer should know

_Shortcuts taken, things deferred, areas to look closely at, context that isn't obvious from the code._
