package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// ── Output types ──────────────────────────────────────────────────────────────

type PodcastTurn struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

type PodcastSpeakerConfig struct {
	Gender string `json:"gender,omitempty"`
	Voice  string `json:"voice,omitempty"`
}

type PodcastSpeakers struct {
	HostA PodcastSpeakerConfig `json:"host_a,omitempty"`
	HostB PodcastSpeakerConfig `json:"host_b,omitempty"`
}

type PodcastAnalysis struct {
	TurnCount                int            `json:"turn_count,omitempty"`
	TotalWords               int            `json:"total_words,omitempty"`
	AverageWordsPerTurn      float64        `json:"average_words_per_turn,omitempty"`
	EstimatedDurationSeconds int            `json:"estimated_duration_seconds,omitempty"`
	SpeakerTurnCounts        map[string]int `json:"speaker_turn_counts,omitempty"`
	SpeakerWordCounts        map[string]int `json:"speaker_word_counts,omitempty"`
}

type PodcastScript struct {
	RunID       string          `json:"run_id"`
	Title       string          `json:"title"`
	Language    string          `json:"language"`
	RenderVideo *bool           `json:"render_video,omitempty"`
	Speakers    PodcastSpeakers `json:"speakers,omitempty"`
	Analysis    PodcastAnalysis `json:"analysis,omitempty"`
	Turns       []PodcastTurn   `json:"turns"`
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

// RunPodcast generates the podcast dialogue script from an extracted paper.
//
// Latency optimisation: metadata extraction and dialogue generation run
// concurrently — both need only the extracted text which is already in memory.
func RunPodcast(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, extractedPath, userID, paperID,
	title, authors, language, hostAGender, hostBGender, renderVideoRaw, tone string,
) error {
	log.Printf("[podcast][%s] downloading extracted document", runID)
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}
	log.Printf("[podcast][%s] downloaded (%d chars)", runID, len(extracted.Text))

	// ── Metadata + dialogue in parallel ──────────────────────────────────────
	type dialogueResult struct {
		raw rawPodcastResponse
		err error
	}
	type metaResult struct {
		meta gemini.Metadata
		err  error
	}

	dialogueCh := make(chan dialogueResult, 1)
	metaCh := make(chan metaResult, 1)

	go func() {
		log.Printf("[podcast][%s] calling Gemini for dialogue", runID)
		prompt := podcastPrompt(title, authors, extracted.Text, tone, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, gemini.ModelFlash, prompt)
		if err != nil {
			dialogueCh <- dialogueResult{err: err}
			return
		}
		raw = gemini.StripCodeFences(raw)
		raw = gemini.FixJSONBackslashes(raw)
		parsed, err := parseRawPodcastResponse(raw, runID)
		dialogueCh <- dialogueResult{raw: parsed, err: err}
	}()

	go func() {
		// Only extract if caller didn't already provide both title and authors
		if title != "" && authors != "" {
			metaCh <- metaResult{meta: gemini.Metadata{Title: title, Authors: authors}}
			return
		}
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	dlgRes := <-dialogueCh
	if dlgRes.err != nil {
		return fmt.Errorf("gemini podcast dialogue: %w", dlgRes.err)
	}

	metaRes := <-metaCh
	if metaRes.err != nil {
		log.Printf("[podcast][%s] metadata extraction failed, using provided values: %v", runID, metaRes.err)
	} else {
		if title == "" {
			title = metaRes.meta.Title
		}
		if authors == "" {
			authors = metaRes.meta.Authors
		}
	}

	podcast, err := buildCanonicalPodcastScript(runID, title, language, hostAGender, hostBGender, renderVideoRaw, dlgRes.raw)
	if err != nil {
		return fmt.Errorf("build canonical podcast script: %w", err)
	}

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/script_gen/podcast_dialogue.json", userID, paperID, runUUID)
	podcastBytes, _ := json.Marshal(podcast)
	gcsPath, err := deps.Store.Upload(ctx, podcastBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload podcast dialogue: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "podcast_script_gen", "completed", gcsPath, "", title, authors, "")
	log.Printf("[podcast][%s] completed: output=%s turns=%d words=%d", runID, gcsPath, len(podcast.Turns), podcast.Analysis.TotalWords)
	return nil
}

// ── Raw response parsing ──────────────────────────────────────────────────────

type rawPodcastResponse struct {
	Title    string
	Language string
	Turns    []PodcastTurn
}

func parseRawPodcastResponse(raw, runID string) (rawPodcastResponse, error) {
	var decoded interface{}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return rawPodcastResponse{}, fmt.Errorf("JSON parse: %w", err)
	}

	result := rawPodcastResponse{}
	turnsSource := decoded

	if rawMap, ok := decoded.(map[string]interface{}); ok {
		result.Title = firstNonEmptyStr(rawMap["title"], rawMap["episode_title"], rawMap["name"])
		result.Language = firstNonEmptyStr(rawMap["language"], rawMap["language_code"], rawMap["lang"])
		for _, key := range []string{"turns", "dialogue", "dial", "conversation", "messages", "lines"} {
			if candidate, exists := rawMap[key]; exists {
				turnsSource = candidate
				log.Printf("[podcast][%s] found turns array under key %q", runID, key)
				break
			}
		}
	}

	items, ok := turnsSource.([]interface{})
	if !ok {
		return rawPodcastResponse{}, fmt.Errorf("response did not contain a turns array")
	}

	turns := make([]PodcastTurn, 0, len(items))
	for idx, item := range items {
		turn, ok := normalizePodcastTurn(item)
		if !ok {
			log.Printf("[podcast][%s] skipping malformed turn %d", runID, idx)
			continue
		}
		if idx < 3 {
			log.Printf("[podcast][%s] turn %d: speaker=%q text_len=%d", runID, idx, turn.Speaker, len(turn.Text))
		}
		turns = append(turns, turn)
	}

	if len(turns) == 0 {
		return rawPodcastResponse{}, fmt.Errorf("no dialogue turns found in response")
	}
	result.Turns = turns
	return result, nil
}

func normalizePodcastTurn(item interface{}) (PodcastTurn, bool) {
	rawTurn, ok := item.(map[string]interface{})
	if !ok {
		return PodcastTurn{}, false
	}

	speaker := firstNonEmptyStr(rawTurn["speaker"], rawTurn["host"], rawTurn["role"], rawTurn["name"], rawTurn["character"])
	text := firstNonEmptyStr(rawTurn["text"], rawTurn["dialogue"], rawTurn["line"], rawTurn["content"], rawTurn["message"], rawTurn["utterance"], rawTurn["speech"], rawTurn["narration"])

	// Some model outputs use speaker names as keys, e.g. {"host_a": "..."}
	if text == "" {
		for _, key := range []string{"host_a", "host_b", "aisha", "rohan", "a", "b"} {
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

	speaker = normalizePodcastSpeaker(speaker)
	text = strings.TrimSpace(text)
	if speaker == "" {
		speaker = "host_a"
	}
	return PodcastTurn{Speaker: speaker, Text: text}, true
}

func normalizePodcastSpeaker(s string) string {
	n := strings.ToLower(strings.TrimSpace(s))
	n = strings.NewReplacer(" ", "", "-", "", "_", "").Replace(n)
	switch n {
	case "hosta", "speakera", "a", "aisha":
		return "host_a"
	case "hostb", "speakerb", "b", "rohan":
		return "host_b"
	default:
		return strings.TrimSpace(s)
	}
}

// ── Canonical script builder + validator ──────────────────────────────────────

func buildCanonicalPodcastScript(runID, metadataTitle, requestedLanguage, hostAGender, hostBGender, renderVideoRaw string, raw rawPodcastResponse) (PodcastScript, error) {
	turns := make([]PodcastTurn, 0, len(raw.Turns))
	for idx, t := range raw.Turns {
		canonical := PodcastTurn{
			Speaker: normalizePodcastSpeaker(t.Speaker),
			Text:    cleanPodcastTurnText(t.Text),
		}
		if canonical.Speaker == "" {
			canonical.Speaker = podcastSpeakerForIndex(idx)
		}
		turns = append(turns, canonical)
	}

	title := gemini.DefaultString(metadataTitle, strings.TrimSpace(raw.Title))
	language := gemini.DefaultString(requestedLanguage, gemini.DefaultString(strings.TrimSpace(raw.Language), "en-IN"))
	renderVideo := parseBoolDefault(renderVideoRaw, true)

	podcast := PodcastScript{
		RunID:       runID,
		Title:       title,
		Language:    language,
		RenderVideo: boolPtr(renderVideo),
		Speakers: PodcastSpeakers{
			HostA: PodcastSpeakerConfig{Gender: gemini.DefaultString(hostAGender, "female")},
			HostB: PodcastSpeakerConfig{Gender: gemini.DefaultString(hostBGender, "male")},
		},
		Analysis: analyzePodcastTurns(turns),
		Turns:    turns,
	}

	if err := validatePodcastScript(podcast); err != nil {
		return PodcastScript{}, err
	}
	return podcast, nil
}

func validatePodcastScript(p PodcastScript) error {
	if strings.TrimSpace(p.Title) == "" {
		return fmt.Errorf("podcast title is empty")
	}
	if len(p.Turns) < 10 {
		return fmt.Errorf("podcast has too few turns: %d (want ≥10)", len(p.Turns))
	}
	emptyCount := 0
	for idx, t := range p.Turns {
		if t.Speaker != "host_a" && t.Speaker != "host_b" {
			return fmt.Errorf("turn %d has invalid speaker %q", idx, t.Speaker)
		}
		if strings.TrimSpace(t.Text) == "" {
			emptyCount++
		}
	}
	if emptyCount > 0 {
		return fmt.Errorf("podcast has %d/%d turns with empty text", emptyCount, len(p.Turns))
	}
	return nil
}

func analyzePodcastTurns(turns []PodcastTurn) PodcastAnalysis {
	turnCounts := map[string]int{}
	wordCounts := map[string]int{}
	totalWords := 0
	for _, t := range turns {
		speaker := normalizePodcastSpeaker(t.Speaker)
		words := len(strings.Fields(t.Text))
		turnCounts[speaker]++
		wordCounts[speaker] += words
		totalWords += words
	}
	a := PodcastAnalysis{
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

func cleanPodcastTurnText(text string) string {
	text = gemini.CleanNarration(text)
	text = strings.ReplaceAll(text, "`", "")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.Join(strings.Fields(text), " ")
	return strings.TrimSpace(text)
}

func podcastSpeakerForIndex(idx int) string {
	if idx%2 == 0 {
		return "host_a"
	}
	return "host_b"
}

// ── Prompt builder ────────────────────────────────────────────────────────────

func podcastPrompt(title, authors, paperText, tone string, prompts config.PromptConfig) string {
	sys := prompts.Podcast.System
	if toneHint, ok := prompts.ToneHints[gemini.ResolveTone(tone)]; ok && toneHint.Podcast != "" {
		sys = sys + "\n\nTONE OVERRIDE: " + toneHint.Podcast
	}
	instructions := strings.Join(prompts.Podcast.Instructions, "\n- ")
	schemaBytes, _ := json.Marshal(prompts.Podcast.Schema)

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

	return fmt.Sprintf(`%s

REQUIRED JSON SCHEMA (follow exactly):
%s

CRITICAL INSTRUCTIONS:
- %s

%s

Paper text to convert into podcast dialogue:
%s

FINAL CHECK: Every turn in your JSON MUST have:
1. A "speaker" field set to either "host_a" or "host_b"
2. A "text" field with actual dialogue (minimum 5 words) — NEVER an empty string

Return ONLY valid JSON. No markdown fences. No code blocks. No explanation. Just the raw JSON object.`,
		sys, string(schemaBytes), instructions, header, paperText)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// firstNonEmptyStr returns the first non-empty string value from the given
// interface{} values, recursively unwrapping maps and slices.
func firstNonEmptyStr(values ...interface{}) string {
	for _, value := range values {
		switch typed := value.(type) {
		case string:
			if t := strings.TrimSpace(typed); t != "" {
				return t
			}
		case map[string]interface{}:
			if nested := firstNonEmptyStr(typed["text"], typed["content"], typed["value"], typed["message"], typed["line"]); nested != "" {
				return nested
			}
		case []interface{}:
			parts := make([]string, 0, len(typed))
			for _, part := range typed {
				if s := firstNonEmptyStr(part); s != "" {
					parts = append(parts, s)
				}
			}
			if len(parts) > 0 {
				return strings.Join(parts, " ")
			}
		}
	}
	return ""
}

func parseBoolDefault(s string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return fallback
	}
}

func boolPtr(v bool) *bool { return &v }

// whitespaceRE is used by cleanPodcastTurnText.
var whitespaceRE = regexp.MustCompile(`\s+`)

// suppress the unused warning — whitespaceRE is available for future use.
var _ = whitespaceRE
