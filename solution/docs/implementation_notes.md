# SARAL AI — Technical Implementation Notes

## 1. Architecture & Pipeline Integration

The solution is architected as a modular, self-contained package in `solution/` at the repository root, directly integrated with SARAL's production worker services in `backend/services/beamer/`.

```
SARAL/
├── solution/
│   ├── README.md                      # Entry point for maintainers & reviewers
│   ├── presentation/
│   │   ├── engine.py                  # Redesigned Beamer presentation engine
│   │   ├── archetypes.py              # Semantic slide classification & archetypes
│   │   └── __init__.py
│   ├── poster/
│   │   ├── engine.py                  # Poster document builder & geometry manager
│   │   ├── layouts.py                 # Structured Grid, Takeaway-Led & Workflow-Led layouts
│   │   ├── themes.py                  # Theme generator (beamerthemegemini.sty, beamercolorthemegemini.sty)
│   │   └── __init__.py
│   ├── shared/
│   │   ├── tokens.py                  # Design tokens, color palettes, and aliases
│   │   ├── latex_utils.py             # Math preservation, safe escaping, and Indic font engine
│   │   └── __init__.py
│   ├── tests/
│   │   ├── fixtures.py                # Research paper fixtures across multiple domains
│   │   ├── test_math_preservation.py  # LaTeX math & currency escaping tests
│   │   ├── test_presentation_archetypes.py # Slide archetypes and Beamer theme tests
│   │   ├── test_poster_archetypes.py  # Poster layouts, dynamic balancing, and theme tests
│   │   ├── test_multilingual.py       # Indic script and font mapping tests
│   │   ├── test_scientific_integrity.py # Non-fabrication & honest missing data tests
│   │   ├── test_backward_compatibility.py # API signature and legacy theme alias tests
│   │   ├── test_integration_payloads.py   # Regression and integration tests
│   │   └── run_all_tests.py           # Unified test suite runner
│   └── docs/
│       ├── design_system.md           # Visual design tokens and layout specifications
│       ├── implementation_notes.md    # Architecture and integration details
│       └── verification_report.md     # Test execution records and environment audit
├── backend/
│   ├── solution/                      # Synchronized build mirror for Docker build context
│   ├── gateway/
│   │   └── internal/
│   │       └── pipeline/
│   │           └── poster.go          # Binds theme/layout in HTTP handlers and forwards to Redis
│   └── services/
│       └── beamer/
│           ├── latex_template.py      # Production adapter importing solution presentation engine
│           ├── latex_poster_template.py # Production adapter importing solution poster engine
│           ├── poster_worker.py       # Enhanced to extract theme & layout parameters
│           └── Dockerfile             # Copies /app/solution and sets PYTHONPATH
└── frontend/
    ├── components/
    │   └── modals/
    │       └── poster-config-modal.tsx # UI modal for selecting poster theme & layout
    └── lib/
        ├── api/
        │   └── poster.ts              # Passes theme & layout in startPoster and confirmPoster
        └── stores/
            ├── artifact-store.ts      # Active modal selection & actions
            └── slices/
                └── poster-slice.ts    # Poster generation state slice
```

---

## 2. Key Engineering Solutions & Repairs

### 2.1 Docker Build Context Resolution

#### Baseline Challenge
The production Docker build command for the Beamer service is executed from the `backend/` directory:
```bash
cd backend && docker build -f services/beamer/Dockerfile -t saral-beamer .
```
Because the build context is `backend/`, Docker cannot access files located at `../solution` outside its build context root.

#### Solution
1. Mirrored `solution/` into `backend/solution/` so that the build context directly contains the solution package.
2. Updated `backend/services/beamer/Dockerfile`:
   ```dockerfile
   COPY solution /app/solution
   ENV PYTHONPATH="/app:${PYTHONPATH}"
   ```
3. Added automated regression test `test_docker_mirror_synchronization` to verify that `solution/` and `backend/solution/` remain byte-for-byte identical.

### 2.2 LaTeX Math Preservation & Multiline Sanitization

#### Legacy Defect
In the original `latex_template.py`, `LATEX_SPECIALS` converted `$` unconditionally to `\$`, breaking formulas like `$O(n)$` into `\$O(n)\$`. Furthermore, when escaping multiline text, double newlines were converted into `\par` or inserted globally, which inside display math (`\[...\]` or `\begin{align}`) caused fatal LaTeX compilation errors:
`! Paragraph ended before \[ was complete.`

#### Solution
In `solution/shared/latex_utils.py`:
1. **Currency Disarming**: Converts `$100`, `$5.5M` to `\$100` before math span parsing using a non-capturing negative lookbehind regex.
2. **Math Preservation**: Detects `$...$`, `\(...\)`, `\[...\]`, and `\begin{...}` environments, storing them safely in placeholders.
3. **Multiline Math Sanitization**: Only converts newlines into `\n\n` outside math spans, completely avoiding `\par` injection inside math environments.

### 2.3 Presentation Engine Hardening

1. **Footline Title Macro Safety**:
   - *Previous Bug*: Slicing formatted title strings cut through LaTeX commands (e.g. `\devanagarifont{...}` -> `\devanaga...`), leading to unbalanced braces and fatal XeLaTeX errors.
   - *Fix*: The engine now measures and slices `raw_title` *before* escaping and font macro wrapping.
2. **Booktabs Inclusion**:
   - `\usepackage{booktabs}` is now explicitly included in the presentation preamble.
3. **Fragile Frame Detection**:
   - Frames containing `\verb`, `\begin{verbatim}`, or `\begin{lstlisting}` are automatically given the `[fragile]` option.

### 2.4 Poster Engine & Multilingual Layout Repair

#### Legacy Defect
While multilingual support was declared for presentations, the poster layout generator (`solution/poster/layouts.py`) previously accepted only raw text strings and did not wrap Indic Unicode characters inside `\devanagarifont` or other script macros for block body text. Additionally, `takeaway_led` suffered from column dimension overfull errors due to nested separators.

#### Solution
1. Updated all layout block builders (`_block`, `_bullet_block`, `_figure_block`, `_references_block`) in `solution/poster/layouts.py` to accept `font_wrapper` and `font_script`, wrapping all text runs with `wrap_script_runs()`.
2. Cleaned column geometry in `takeaway_led` so that `\separatorcolumn` is placed once at the grid level without redundant nesting.
3. Added test assertions in `test_multilingual.py` and `test_integration_payloads.py` verifying `\devanagarifont` appears throughout generated poster documents.

### 2.5 Frontend Poster Configuration Workflow

To bring poster generation in line with the presentation workflow:
1. Created `frontend/components/modals/poster-config-modal.tsx` supporting 5 themes and 3 layout archetypes.
2. Integrated modal state into `frontend/lib/stores/artifact-store.ts` and `artifact-store-types.ts`.
3. Updated `frontend/lib/stores/slices/poster-slice.ts` to accept `theme` and `layout` in `startPosterGeneration` and `confirmPoster`.
4. Updated `backend/gateway/internal/pipeline/poster.go` to accept `theme` and `layout` in JSON request bodies and forward them in `redisx.JobData` to `StreamPoster` and `StreamScript`.
5. Enhanced `backend/services/beamer/poster_worker.py` to read `theme` and `layout` from Redis job data or poster content, generating matching `.sty` theme files and applying the layout.

### 2.6 Verified Defect Resolutions (Post-Audit Hardening)

1. **Headline TikZ Command Elimination (`solution/poster/themes.py`)**:
   - *Previous Bug*: The headline template in `beamerthemegemini.sty` included a bare TikZ `\fill[geminiaccent] (0,0) rectangle (\paperwidth, 4pt);` outside any `tikzpicture` environment, causing XeLaTeX compilation errors (`! Package pgf/tikz Error: You cannot use '\path' outside of a tikzpicture environment`).
   - *Fix*: Replaced the TikZ command with standard scoped LaTeX `{\color{geminiaccent}\rule{\paperwidth}{4pt}}`, which requires only `xcolor` (already loaded) and eliminates the TikZ runtime dependency.

2. **Block Body Surface Color Preservation (`solution/poster/themes.py`)**:
   - *Previous Bug*: `beamercolorthemegemini.sty` hardcoded `\setbeamercolor{block body}{fg=black,bg=white}`, overriding the theme's designated `palette.surface` background color (e.g. Amber Earth's `#FEF3C7` or Teal Emerald's `#ECFDF5`) and creating inconsistency with `beamerthemegemini.sty`.
   - *Fix*: Defined `\definecolor{geminisurface}{HTML}{...}` from `palette.surface` and set `\setbeamercolor{block body}{fg=black,bg=geminisurface}`, ensuring poster card surfaces honor tinted theme palettes.

3. **Poster Retry Pipeline & Worker Robustness (`backend/gateway/` & `poster_worker.py`)**:
   - *Previous Bug*: In `backend/gateway/internal/pipeline/retry.go`, `retryPoster` queried `db.GetStepOutput(ctx, pool, runID, "poster_compile")` instead of `"script_gen"`, and enqueued a Redis job that omitted `poster_content_gcs_path`, `theme`, and `layout`. This caused `poster_worker.py` to fail on retry with `KeyError: 'poster_content_gcs_path'`.
   - *Fix*:
     - In `poster.go`, persisted `theme` and `layout` into run checkpoint data during `PosterStartHandler` and `PosterConfirmHandler`, falling back to checkpoint if confirm parameters are omitted.
     - In `retry.go`, added `ckStr` helper for metadata string retrieval, retrieved `poster_content_gcs_path` from `"script_gen"` (fallback `ckPath("script_path")`), ensured retry aborts safely if content path is absent, forwarded `poster_content_gcs_path`, `theme`, and `layout`, and checked enqueue return error.
     - In `poster_worker.py`, defensively validated `poster_content_gcs_path` inside the try-block, raising `ValueError` and cleanly sending failure webhooks if the path is missing or empty.

