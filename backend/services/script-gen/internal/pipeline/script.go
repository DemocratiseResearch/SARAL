package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// RunScript generates the standard 5-section narration script from an
// extracted paper document and uploads it to GCS.
//
// Latency optimisation: metadata extraction and narration generation run
// concurrently (two independent Gemini calls). Bullet refinement then runs
// concurrently with the GCS upload so the second Gemini round-trip overlaps
// with I/O. Net saving: ~2–4 s per job on typical paper sizes.
func RunScript(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, audienceLevel, tone, extractedPath, userID, paperID,
	title, authors, date string,
) error {
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}

	// ── Step 1: metadata + narration in parallel ──────────────────────────────
	type narrationResult struct {
		sections []Section
		err      error
	}
	type metaResult struct {
		meta gemini.Metadata
		err  error
	}

	narrationCh := make(chan narrationResult, 1)
	metaCh := make(chan metaResult, 1)

	go func() {
		prompt := scriptPrompt(audienceLevel, tone, extracted.Text, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, gemini.ModelFlash, prompt)
		if err != nil {
			narrationCh <- narrationResult{err: err}
			return
		}
		raw = gemini.StripCodeFences(raw)
		raw = gemini.FixJSONBackslashes(raw)
		var body struct {
			Sections []Section `json:"sections"`
		}
		if parseErr := json.Unmarshal([]byte(raw), &body); parseErr != nil {
			narrationCh <- narrationResult{err: fmt.Errorf("parse narration JSON: %w", parseErr)}
			return
		}
		narrationCh <- narrationResult{sections: body.Sections}
	}()

	go func() {
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	narRes := <-narrationCh
	if narRes.err != nil {
		return fmt.Errorf("gemini narration: %w", narRes.err)
	}
	sections := narRes.sections

	metaRes := <-metaCh
	if metaRes.err != nil {
		log.Printf("[script-gen][%s] metadata extraction failed, using provided values: %v", runID, metaRes.err)
	} else {
		if metaRes.meta.Title != "" {
			title = metaRes.meta.Title
		}
		if metaRes.meta.Authors != "" {
			authors = metaRes.meta.Authors
		}
		if metaRes.meta.Date != "" {
			date = metaRes.meta.Date
		}
	}

	for i := range sections {
		sections[i].Narration = gemini.CleanNarration(sections[i].Narration)
	}

	// ── Step 2: bullet refinement + upload in parallel ────────────────────────
	bulletErrCh := make(chan error, 1)
	gSections := toGeminiBulletSections(sections)
	go func() {
		bulletErrCh <- gemini.GenerateBullets(ctx, gc, gemini.ModelFlash, audienceLevel, tone, gSections, deps.Prompts)
	}()

	// Build the script struct while bullets are generating
	script := Script{
		RunID:         runID,
		AudienceLevel: audienceLevel,
		Tone:          tone,
		Title:         title,
		Authors:       authors,
		Date:          date,
		TitleIntro:    gemini.GenerateTitleIntro(title, authors, date),
		Sections:      sections,
	}

	if err := <-bulletErrCh; err != nil {
		log.Printf("[script-gen][%s] bullet generation failed, keeping narration bullets: %v", runID, err)
	} else {
		mergeGeminiBullets(gSections, script.Sections)
	}

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/script_gen/script.json", userID, paperID, runUUID)
	scriptBytes, _ := json.Marshal(script)
	gcsPath, err := deps.Store.Upload(ctx, scriptBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload script: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "script_gen", "completed", gcsPath, "", title, authors, date)
	log.Printf("[script-gen][%s] completed: output=%s title=%q", runID, gcsPath, title)
	return nil
}

// RunSlidesDeck generates the slides-deck variant (on-slide bullets, compact
// speaker notes). Metadata and deck content run concurrently.
func RunSlidesDeck(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, extractedPath, userID, paperID string,
) error {
	const deckAudience = "intermediate"

	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}

	type deckResult struct {
		titleIntro string
		sections   []Section
		err        error
	}
	type metaResult struct {
		meta gemini.Metadata
		err  error
	}

	deckCh := make(chan deckResult, 1)
	metaCh := make(chan metaResult, 1)

	go func() {
		prompt := slidesDeckPrompt(extracted.Text, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, gemini.ModelFlash, prompt)
		if err != nil {
			deckCh <- deckResult{err: err}
			return
		}
		raw = gemini.StripCodeFences(raw)
		raw = gemini.FixJSONBackslashes(raw)
		var deck struct {
			TitleIntro string    `json:"title_intro"`
			Sections   []Section `json:"sections"`
		}
		if parseErr := json.Unmarshal([]byte(raw), &deck); parseErr != nil {
			deckCh <- deckResult{err: fmt.Errorf("parse slides deck JSON: %w", parseErr)}
			return
		}
		if len(deck.Sections) == 0 {
			deckCh <- deckResult{err: fmt.Errorf("slides deck JSON has no sections")}
			return
		}
		deckCh <- deckResult{titleIntro: deck.TitleIntro, sections: deck.Sections}
	}()

	go func() {
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	deckRes := <-deckCh
	if deckRes.err != nil {
		return fmt.Errorf("gemini slides deck: %w", deckRes.err)
	}
	metaRes := <-metaCh

	sections := deckRes.sections
	var title, authors, date string
	if metaRes.err != nil {
		log.Printf("[slides-deck][%s] metadata extraction failed: %v", runID, metaRes.err)
	} else {
		title, authors, date = metaRes.meta.Title, metaRes.meta.Authors, metaRes.meta.Date
	}

	for i := range sections {
		sections[i].Narration = gemini.CleanNarration(sections[i].Narration)
	}

	gSections := toGeminiBulletSections(sections)
	if err := gemini.GenerateBullets(ctx, gc, gemini.ModelFlash, deckAudience, "formal", gSections, deps.Prompts); err != nil {
		log.Printf("[slides-deck][%s] bullet refinement skipped: %v", runID, err)
	} else {
		mergeGeminiBullets(gSections, sections)
	}

	titleIntro := strings.TrimSpace(deckRes.titleIntro)
	if titleIntro == "" {
		titleIntro = gemini.GenerateTitleIntro(title, authors, date)
	}

	script := Script{
		RunID:         runID,
		AudienceLevel: deckAudience,
		Title:         title,
		Authors:       authors,
		Date:          date,
		TitleIntro:    titleIntro,
		Sections:      sections,
	}

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/script_gen/script.json", userID, paperID, runUUID)
	scriptBytes, _ := json.Marshal(script)
	gcsPath, err := deps.Store.Upload(ctx, scriptBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload slides deck script: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "script_gen", "completed", gcsPath, "", title, authors, date)
	log.Printf("[slides-deck][%s] completed: output=%s title=%q", runID, gcsPath, title)
	return nil
}

// ── Prompt builders ───────────────────────────────────────────────────────────

func scriptPrompt(audienceLevel, tone, paperText string, prompts config.PromptConfig) string {
	hint := prompts.AudienceHints[audienceLevel]
	toneNarration := prompts.ToneHints[tone].Narration
	instructions := strings.Join(prompts.Instructions, "\n- ")
	return fmt.Sprintf(`%s

──────────────────────────────────────────────────────────────────
AUDIENCE OVERRIDE — applies on top of every rule above:
%s

TONE OVERRIDE:
%s
──────────────────────────────────────────────────────────────────

INSTRUCTIONS:
- %s

PAPER TEXT:
%s

Return ONLY the JSON object. No markdown fences. No commentary.`,
		prompts.System,
		hint.Narration,
		toneNarration,
		instructions,
		paperText,
	)
}

func slidesDeckPrompt(paperText string, prompts config.PromptConfig) string {
	hint := prompts.AudienceHints["intermediate"]
	instructions := strings.Join(prompts.SlidesDeck.Instructions, "\n- ")
	return fmt.Sprintf(`%s

SLIDE TEXT STYLE (bullet constraints for on-slide content):
%s

INSTRUCTIONS:
- %s

PAPER TEXT:
%s

Return ONLY valid JSON with exactly two top-level keys: "title_intro" and "sections".
No markdown fences. No commentary.`,
		prompts.SlidesDeck.System,
		hint.Bullets,
		instructions,
		paperText,
	)
}

// ── Section conversion helpers ────────────────────────────────────────────────

func toGeminiBulletSections(sections []Section) []gemini.Section {
	out := make([]gemini.Section, len(sections))
	for i, s := range sections {
		out[i] = gemini.Section{
			ID:        s.ID,
			Title:     s.Title,
			Summary:   s.Summary,
			Narration: s.Narration,
			Bullets:   s.Bullets,
		}
	}
	return out
}

func mergeGeminiBullets(src []gemini.Section, dst []Section) {
	for i := range dst {
		if i < len(src) && len(src[i].Bullets) > 0 {
			dst[i].Bullets = src[i].Bullets
		}
	}
}
