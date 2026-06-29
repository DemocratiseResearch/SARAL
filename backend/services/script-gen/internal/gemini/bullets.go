package gemini

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/saral/script-gen/internal/config"
)

// Section mirrors the shared script section structure, defined here to avoid
// a circular import. Pipelines cast to/from their own Section type.
type Section struct {
	ID        string
	Title     string
	Summary   string
	Narration string
	Bullets   []string
}

// GenerateBullets calls Gemini to produce disciplined slide bullets for each
// section and merges the result back into sections in-place.
// Non-fatal: if the call fails, sections keep their narration-derived bullets.
func GenerateBullets(ctx context.Context, gc Provider, model, audienceLevel, tone string, sections []Section, promptCfg config.PromptConfig) error {
	prompt := buildBulletPrompt(audienceLevel, tone, sections, promptCfg)
	raw, err := Generate(ctx, gc, model, prompt)
	if err != nil {
		return fmt.Errorf("gemini bullet call: %w", err)
	}
	parseBulletsInto(raw, sections)
	return nil
}

// buildBulletPrompt assembles the bullet-generation prompt from the audience
// hint in prompts.json plus hard-coded content discipline rules.
//
// The discipline rules are kept in Go (not in prompts.json) because they must
// reference the concrete section narrations available only at runtime, and
// because the quality bar for on-slide text is critical enough that it should
// not be accidentally edited in a JSON file.
func buildBulletPrompt(audienceLevel, tone string, sections []Section, promptCfg config.PromptConfig) string {
	hint := promptCfg.AudienceHints[audienceLevel].Bullets
	// Bullets stay disciplined English fragments regardless of tone — they are
	// skimmed/searched by viewers and must be universally readable.
	_ = tone

	var sb strings.Builder
	sb.WriteString("You are creating slide bullet points for a research paper presentation.\n\n")
	sb.WriteString("Bullet constraint: " + hint + "\n\n")
	sb.WriteString("CONTENT DISCIPLINE (mandatory):\n")
	sb.WriteString("1. Lift a SPECIFIC name, number, or verdict from the section narration. Name benchmarks, baselines, metrics with units.\n")
	sb.WriteString("2. Lead with the noun or number. \"84.7% layout coherence on OpenPaper-500\" beats \"The system achieves 84.7% accuracy\".\n")
	sb.WriteString("3. BANNED PHRASES — rewrite: leverage, synergy, cutting-edge, revolutionary, paradigm shift, game-changing, drive value, at scale, best-in-class, innovative, robust solution, state-of-the-art, novel approach, comprehensive framework, holistic, seamless.\n")
	sb.WriteString("4. So-what test: if removing a bullet doesn't change a viewer's understanding, drop it.\n")
	sb.WriteString("5. NEVER invent facts. If the narration doesn't mention a number or named baseline, don't add one.\n\n")
	sb.WriteString("FORMAT — each bullet MUST be a complete active-voice sentence:\n")
	sb.WriteString("- Subject + active verb + object/result. 8–15 words. End with a period.\n")
	sb.WriteString("- NO colon-fragment shape (\"Topic: descriptor.\"). NO passive voice. NO bare noun phrases.\n\n")
	sb.WriteString("GOOD: \"The visual-feedback loop lifts layout coherence by 13.5 points over PPTAgent.\"\n")
	sb.WriteString("BAD:  \"Cement: Critical industry, major polluter.\"  (fragment + colon shape)\n\n")
	sb.WriteString("Generate exactly 3–5 bullets per section. Prefix each with •. No section numbering.\n\n")
	sb.WriteString("Output format — one block per section:\n")
	sb.WriteString("[SECTION TITLE]\n• Sentence one.\n• Sentence two.\n\n")
	sb.WriteString("---SECTIONS---\n\n")
	for _, sec := range sections {
		sb.WriteString(fmt.Sprintf("[%s]\n%s\n\n", sec.Title, sec.Narration))
	}
	sb.WriteString("Return ONLY the formatted blocks above. No extra text.")
	return sb.String()
}

// parseBulletsInto parses the [SECTION TITLE]\n• bullet\n... output and merges
// bullets into sections by case-insensitive title match.
func parseBulletsInto(raw string, sections []Section) {
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
