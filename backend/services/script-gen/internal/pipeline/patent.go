package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// RunPatent generates a 6-section educational video script for a patent document.
// It reuses Script/Section output types so downstream beamer/audio/ffmpeg workers
// need zero changes.
//
// Latency optimisation: metadata extraction runs concurrently with the
// narration generation call.
func RunPatent(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, audienceLevel, tone, extractedPath, userID, paperID string,
) error {
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}

	patent := deps.Prompts.Patent
	model := patent.Model
	if model == "" {
		model = gemini.ModelFlash
	}

	// ── Metadata + narration in parallel ──────────────────────────────────────
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
		prompt := patentPrompt(patent, audienceLevel, tone, extracted.Text, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, model, prompt)
		if err != nil {
			narrationCh <- narrationResult{err: err}
			return
		}
		sections := parsePatentSections(raw, patent.Sections)
		narrationCh <- narrationResult{sections: sections}
	}()

	go func() {
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	narRes := <-narrationCh
	if narRes.err != nil {
		return fmt.Errorf("gemini patent narration: %w", narRes.err)
	}
	sections := narRes.sections

	metaRes := <-metaCh
	var title, authors, date string
	if metaRes.err != nil {
		log.Printf("[patent][%s] metadata extraction failed (non-fatal): %v", runID, metaRes.err)
	} else {
		title, authors, date = metaRes.meta.Title, metaRes.meta.Authors, metaRes.meta.Date
	}

	// Bullet generation (non-fatal if it fails)
	if patent.BulletPromptTemplate != "" {
		bulletPrompt := patentBulletPrompt(patent, audienceLevel, sections, deps.Prompts)
		rawBullets, bErr := gemini.Generate(ctx, gc, model, bulletPrompt)
		if bErr != nil {
			log.Printf("[patent][%s] bullet generation failed (non-fatal): %v", runID, bErr)
		} else {
			parsePatentBullets(rawBullets, sections)
		}
	}

	script := Script{
		RunID:         runID,
		AudienceLevel: gemini.ResolveAudienceLevel(audienceLevel),
		Tone:          gemini.ResolveTone(tone),
		Title:         title,
		Authors:       authors,
		Date:          date,
		TitleIntro:    gemini.GenerateTitleIntro(title, authors, date),
		Sections:      sections,
		Language:      "en-IN",
		OutputFormat:  "pptx",
	}

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/script_gen/script.json", userID, paperID, runUUID)
	scriptBytes, _ := json.Marshal(script)
	gcsPath, err := deps.Store.Upload(ctx, scriptBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload patent script: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "script_gen", "completed", gcsPath, "", title, authors, date)
	log.Printf("[patent][%s] completed: output=%s title=%q", runID, gcsPath, title)
	return nil
}

// ── Prompt builders ───────────────────────────────────────────────────────────

func patentPrompt(patent config.PatentPromptConfig, audienceLevel, tone, patentText string, prompts config.PromptConfig) string {
	audienceCtx := buildAudienceToneContext(audienceLevel, tone, prompts)
	p := patent.PromptTemplate
	p = strings.ReplaceAll(p, "{input_text}", patentText)
	p = strings.ReplaceAll(p, "{audience_context}", audienceCtx)
	return p
}

func patentBulletPrompt(patent config.PatentPromptConfig, audienceLevel string, sections []Section, prompts config.PromptConfig) string {
	audienceCtx := ""
	if hint, ok := prompts.AudienceHints[gemini.ResolveAudienceLevel(audienceLevel)]; ok {
		audienceCtx = hint.Bullets
	}
	var sb strings.Builder
	for _, sec := range sections {
		sb.WriteString(fmt.Sprintf("[%s]\n%s\n\n", sec.Title, sec.Narration))
	}
	p := patent.BulletPromptTemplate
	p = strings.ReplaceAll(p, "{audience_context}", audienceCtx)
	p = strings.ReplaceAll(p, "{sections_text}", sb.String())
	return p
}

// buildAudienceToneContext composes the audience + tone context block injected
// into the patent prompt template.
func buildAudienceToneContext(audienceLevel, tone string, prompts config.PromptConfig) string {
	var parts []string
	if hint, ok := prompts.AudienceHints[gemini.ResolveAudienceLevel(audienceLevel)]; ok {
		parts = append(parts, "AUDIENCE CONTEXT:\n"+hint.Narration)
	}
	if toneHint, ok := prompts.ToneHints[gemini.ResolveTone(tone)]; ok && toneHint.Narration != "" {
		parts = append(parts, "TONE CONTEXT:\n"+toneHint.Narration)
	}
	return strings.Join(parts, "\n\n")
}

// ── Section parsers ───────────────────────────────────────────────────────────

// parsePatentSections splits Gemini's free-form **Section Title** response into
// Section structs ordered by the sectionNames list from prompts.json.
func parsePatentSections(raw string, sectionNames []string) []Section {
	sections := make([]Section, len(sectionNames))
	for i, name := range sectionNames {
		sections[i] = Section{
			ID:    strings.ToLower(strings.ReplaceAll(name, " ", "_")),
			Title: name,
		}
	}

	sectionRE := regexp.MustCompile(`(?m)^\*\*([^*]+)\*\*\s*$`)
	matches := sectionRE.FindAllStringSubmatchIndex(raw, -1)

	titleIdx := make(map[string]int, len(sections))
	for i, sec := range sections {
		titleIdx[strings.ToLower(strings.TrimSpace(sec.Title))] = i
	}

	for i, m := range matches {
		heading := strings.TrimSpace(raw[m[2]:m[3]])
		idx, ok := titleIdx[strings.ToLower(heading)]
		if !ok {
			continue
		}
		end := len(raw)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		}
		body := strings.TrimSpace(raw[m[1]:end])
		sections[idx].Narration = gemini.CleanNarration(body)
		sections[idx].Summary = gemini.Truncate(body, 120)
	}
	return sections
}

// parsePatentBullets parses the [SECTION_NAME]\n• bullet\n... format from the
// patent bullet-generation call and merges bullets into sections in-place.
func parsePatentBullets(raw string, sections []Section) {
	blockRE := regexp.MustCompile(`(?m)^\[([^\]]+)\]\s*\n((?:[^\[]*\n?)*)`)
	matches := blockRE.FindAllStringSubmatch(raw, -1)

	titleIdx := make(map[string]int, len(sections))
	for i, sec := range sections {
		titleIdx[strings.ToLower(strings.TrimSpace(sec.Title))] = i
	}

	for _, m := range matches {
		secTitle := strings.TrimSpace(m[1])
		idx, ok := titleIdx[strings.ToLower(secTitle)]
		if !ok {
			continue
		}
		var bullets []string
		for _, line := range strings.Split(m[2], "\n") {
			line = strings.TrimSpace(line)
			line = strings.TrimPrefix(line, "•")
			line = strings.TrimPrefix(line, "-")
			line = strings.TrimSpace(line)
			if line != "" {
				bullets = append(bullets, line)
			}
		}
		if len(bullets) > 0 {
			sections[idx].Bullets = bullets
		}
	}
}
