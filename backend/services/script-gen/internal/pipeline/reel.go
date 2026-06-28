package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// ── Output types ──────────────────────────────────────────────────────────────

type ReelTurn struct {
	Speaker string `json:"speaker"` // "Person1" (female) | "Person2" (male)
	Text    string `json:"text"`
}

type ReelAvatarSelection struct {
	Pair    string `json:"pair"`
	Person1 string `json:"person1"`
	Person2 string `json:"person2"`
}

type ReelAnalysis struct {
	TurnCount                int            `json:"turn_count,omitempty"`
	TotalWords               int            `json:"total_words,omitempty"`
	AverageWordsPerTurn      float64        `json:"average_words_per_turn,omitempty"`
	EstimatedDurationSeconds int            `json:"estimated_duration_seconds,omitempty"`
	SpeakerTurnCounts        map[string]int `json:"speaker_turn_counts,omitempty"`
	SpeakerWordCounts        map[string]int `json:"speaker_word_counts,omitempty"`
}

type ReelScript struct {
	RunID    string               `json:"run_id"`
	Title    string               `json:"title"`
	Language string               `json:"language"`
	Avatars  *ReelAvatarSelection `json:"avatars,omitempty"`
	Analysis ReelAnalysis         `json:"analysis,omitempty"`
	Turns    []ReelTurn           `json:"turns"`
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

// RunReel generates the short-form reel dialogue script from an extracted paper.
// Metadata extraction and dialogue generation run concurrently.
func RunReel(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, extractedPath, userID, paperID,
	title, authors, language, tone string,
) error {
	log.Printf("[reel][%s] downloading extracted document", runID)
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}
	log.Printf("[reel][%s] downloaded (%d chars)", runID, len(extracted.Text))

	// ── Metadata + dialogue in parallel ──────────────────────────────────────
	type dialogueResult struct {
		raw rawReelResponse
		err error
	}
	type metaResult struct {
		meta gemini.Metadata
		err  error
	}

	dialogueCh := make(chan dialogueResult, 1)
	metaCh := make(chan metaResult, 1)

	go func() {
		log.Printf("[reel][%s] calling Gemini for reel dialogue", runID)
		prompt := reelPrompt(title, authors, extracted.Text, tone, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, gemini.ModelFlash, prompt)
		if err != nil {
			dialogueCh <- dialogueResult{err: err}
			return
		}
		raw = gemini.StripCodeFences(raw)
		raw = gemini.FixJSONBackslashes(raw)
		parsed, err := parseRawReelResponse(raw)
		dialogueCh <- dialogueResult{raw: parsed, err: err}
	}()

	go func() {
		if title != "" && authors != "" {
			metaCh <- metaResult{meta: gemini.Metadata{Title: title, Authors: authors}}
			return
		}
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	dlgRes := <-dialogueCh
	if dlgRes.err != nil {
		return fmt.Errorf("gemini reel dialogue: %w", dlgRes.err)
	}

	metaRes := <-metaCh
	if metaRes.err != nil {
		log.Printf("[reel][%s] metadata extraction failed, using provided values: %v", runID, metaRes.err)
	} else {
		if title == "" {
			title = metaRes.meta.Title
		}
		if authors == "" {
			authors = metaRes.meta.Authors
		}
	}

	reel, err := buildCanonicalReelScript(runID, title, language, dlgRes.raw)
	if err != nil {
		return fmt.Errorf("build canonical reel script: %w", err)
	}

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/reel_script_gen/script.json", userID, paperID, runUUID)
	reelBytes, _ := json.Marshal(reel)
	gcsPath, err := deps.Store.Upload(ctx, reelBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload reel script: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "reel_script_gen", "completed", gcsPath, "", title, authors, "")
	log.Printf("[reel][%s] completed: output=%s turns=%d", runID, gcsPath, len(reel.Turns))
	return nil
}

// ── Raw response parsing ──────────────────────────────────────────────────────

type rawReelResponse struct {
	Title    string
	Language string
	Turns    []ReelTurn
}

func parseRawReelResponse(raw string) (rawReelResponse, error) {
	var decoded interface{}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return rawReelResponse{}, fmt.Errorf("JSON parse: %w", err)
	}

	result := rawReelResponse{}
	turnsSource := decoded

	if rawMap, ok := decoded.(map[string]interface{}); ok {
		result.Title = firstNonEmptyStr(rawMap["title"], rawMap["episode_title"], rawMap["name"])
		result.Language = firstNonEmptyStr(rawMap["language"], rawMap["language_code"], rawMap["lang"])
		for _, key := range []string{"turns", "dialogue", "dial", "conversation", "messages", "lines"} {
			if candidate, exists := rawMap[key]; exists {
				turnsSource = candidate
				break
			}
		}
	}

	items, ok := turnsSource.([]interface{})
	if !ok {
		return rawReelResponse{}, fmt.Errorf("response did not contain a turns array")
	}

	turns := make([]ReelTurn, 0, len(items))
	for idx, item := range items {
		turn, ok := normalizeReelTurn(item, idx)
		if !ok {
			log.Printf("[reel] skipping malformed turn %d", idx)
			continue
		}
		turns = append(turns, turn)
	}

	if len(turns) == 0 {
		return rawReelResponse{}, fmt.Errorf("no dialogue turns found in reel response")
	}
	result.Turns = turns
	return result, nil
}

func normalizeReelTurn(item interface{}, idx int) (ReelTurn, bool) {
	rawTurn, ok := item.(map[string]interface{})
	if !ok {
		return ReelTurn{}, false
	}

	speaker := firstNonEmptyStr(rawTurn["speaker"], rawTurn["host"], rawTurn["role"], rawTurn["name"], rawTurn["character"])
	text := firstNonEmptyStr(rawTurn["text"], rawTurn["dialogue"], rawTurn["line"], rawTurn["content"], rawTurn["message"], rawTurn["utterance"], rawTurn["speech"])

	if text == "" {
		for _, key := range []string{"person1", "person2", "aisha", "rohan", "host_a", "host_b", "a", "b"} {
			if value, exists := rawTurn[key]; exists {
				text = firstNonEmptyStr(value)
				if speaker == "" {
					speaker = key
				}
				if text != "" {
					break
				}
			}
		}
	}

	speaker = normalizeReelSpeaker(speaker)
	if speaker == "" {
		speaker = reelSpeakerForIndex(idx)
	}
	return ReelTurn{Speaker: speaker, Text: strings.TrimSpace(text)}, true
}

func normalizeReelSpeaker(s string) string {
	n := strings.ToLower(strings.TrimSpace(s))
	n = strings.NewReplacer(" ", "", "-", "", "_", "").Replace(n)
	switch n {
	case "person1", "p1", "speaker1", "1", "aisha", "hosta", "speakera", "a", "female", "f":
		return "Person1"
	case "person2", "p2", "speaker2", "2", "rohan", "hostb", "speakerb", "b", "male", "m":
		return "Person2"
	default:
		return ""
	}
}

func reelSpeakerForIndex(idx int) string {
	if idx%2 == 0 {
		return "Person1"
	}
	return "Person2"
}

// ── Canonical script builder + validator ──────────────────────────────────────

func buildCanonicalReelScript(runID, metadataTitle, requestedLanguage string, raw rawReelResponse) (ReelScript, error) {
	turns := make([]ReelTurn, 0, len(raw.Turns))
	for idx, t := range raw.Turns {
		canonical := ReelTurn{
			Speaker: normalizeReelSpeaker(t.Speaker),
			Text:    cleanPodcastTurnText(t.Text),
		}
		if canonical.Speaker == "" {
			canonical.Speaker = reelSpeakerForIndex(idx)
		}
		turns = append(turns, canonical)
	}

	title := gemini.DefaultString(metadataTitle, strings.TrimSpace(raw.Title))
	language := gemini.DefaultString(requestedLanguage, gemini.DefaultString(strings.TrimSpace(raw.Language), "en-IN"))

	reel := ReelScript{
		RunID:    runID,
		Title:    title,
		Language: language,
		Analysis: analyzeReelTurns(turns),
		Turns:    turns,
	}

	if err := validateReelScript(reel); err != nil {
		return ReelScript{}, err
	}
	return reel, nil
}

func validateReelScript(r ReelScript) error {
	if strings.TrimSpace(r.Title) == "" {
		return fmt.Errorf("reel title is empty")
	}
	if len(r.Turns) < 4 || len(r.Turns) > 12 {
		return fmt.Errorf("reel has out-of-range turn count: %d (want 4–12)", len(r.Turns))
	}
	for idx, t := range r.Turns {
		if t.Speaker != "Person1" && t.Speaker != "Person2" {
			return fmt.Errorf("turn %d has invalid speaker %q", idx, t.Speaker)
		}
		if strings.TrimSpace(t.Text) == "" {
			return fmt.Errorf("turn %d has empty text", idx)
		}
	}
	return nil
}

func analyzeReelTurns(turns []ReelTurn) ReelAnalysis {
	turnCounts := map[string]int{}
	wordCounts := map[string]int{}
	totalWords := 0
	for _, t := range turns {
		words := len(strings.Fields(t.Text))
		turnCounts[t.Speaker]++
		wordCounts[t.Speaker] += words
		totalWords += words
	}
	a := ReelAnalysis{
		TurnCount:         len(turns),
		TotalWords:        totalWords,
		SpeakerTurnCounts: turnCounts,
		SpeakerWordCounts: wordCounts,
	}
	if len(turns) > 0 {
		a.AverageWordsPerTurn = float64(totalWords) / float64(len(turns))
	}
	if totalWords > 0 {
		a.EstimatedDurationSeconds = int(math.Ceil(float64(totalWords) / 150.0 * 60.0))
	}
	return a
}

// ── Prompt builder ────────────────────────────────────────────────────────────

func reelPrompt(title, authors, paperText, tone string, prompts config.PromptConfig) string {
	sys := prompts.Reel.System
	if toneHint, ok := prompts.ToneHints[gemini.ResolveTone(tone)]; ok && toneHint.Podcast != "" {
		sys = sys + "\n\nTONE OVERRIDE: " + toneHint.Podcast
	}
	instructions := strings.Join(prompts.Reel.Instructions, "\n- ")
	schemaBytes, _ := json.Marshal(prompts.Reel.Schema)

	header := ""
	if title != "" {
		header += fmt.Sprintf("Title: %s\n", title)
	}
	if authors != "" {
		header += fmt.Sprintf("Authors: %s\n", authors)
	}
	if header != "" {
		header += "\n"
	}

	// Reel only needs the first ~6000 chars — it's hook-focused, not comprehensive
	excerpt := paperText
	if len(excerpt) > 6000 {
		excerpt = excerpt[:6000]
	}

	return fmt.Sprintf(`%s

REQUIRED JSON SCHEMA (follow exactly):
%s

CRITICAL INSTRUCTIONS:
- %s

%s

Paper text to convert into reel dialogue:
%s

FINAL CHECK: Every turn in your JSON MUST have:
1. A "speaker" field set to either "Person1" or "Person2"
2. A "text" field with 15-25 words of natural spoken dialogue — NEVER empty

Return ONLY valid JSON. No markdown fences. No code blocks. No explanation. Just the raw JSON object.`,
		sys, string(schemaBytes), instructions, header, excerpt)
}
