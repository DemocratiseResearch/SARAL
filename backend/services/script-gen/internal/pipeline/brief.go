package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// RunBusinessBrief generates the 8-section business brief using Gemini Pro
// with Google Search grounding and dynamic thinking. The sections JSON is
// uploaded to GCS and the result is sent to the gateway so the beamer MS
// can render the PDF separately.
func RunBusinessBrief(ctx context.Context, gc gemini.Provider, deps Deps,
	briefID, textPath, userID, paperID string,
) error {
	// 1. Download plain extracted text (not the ExtractedDocument JSON)
	textBytes, err := deps.Store.Download(ctx, textPath)
	if err != nil {
		return fmt.Errorf("download text: %w", err)
	}
	inputText := strings.TrimSpace(string(textBytes))
	if inputText == "" {
		return fmt.Errorf("extracted text is empty")
	}

	// 2. Extract paper title for the PDF cover page. Non-fatal if it fails.
	paperTitle := ""
	if meta, err := gemini.ExtractMetadata(ctx, gc, inputText); err == nil {
		paperTitle = meta.Title
	}
	if paperTitle == "" {
		paperTitle = "Research Paper"
	}

	// 3. Build prompt and call Gemini Pro with grounding
	model := deps.Prompts.BusinessBrief.Model
	if model == "" {
		model = gemini.ModelPro
	}
	prompt := strings.ReplaceAll(deps.Prompts.BusinessBrief.PromptTemplate, "{input_text}", inputText)

	log.Printf("[business-brief][%s] calling %s with grounding", briefID, model)
	rawResponse, err := gemini.GenerateWithGrounding(ctx, gc, model, prompt)
	if err != nil {
		return fmt.Errorf("gemini business brief: %w", err)
	}
	log.Printf("[business-brief][%s] raw response length=%d", briefID, len(rawResponse))

	// 4. Parse and validate the expected sections
	sections, err := parseBusinessBriefSections(rawResponse, deps.Prompts.BusinessBrief.Sections)
	if err != nil {
		return fmt.Errorf("parse business brief sections: %w", err)
	}
	log.Printf("[business-brief][%s] parsed %d sections", briefID, len(sections))

	// 5. Upload sections.json to GCS
	objectKey := fmt.Sprintf("%s/%s/business_brief/sections.json", userID, paperID)
	payload := map[string]interface{}{
		"sections":      sections,
		"model_version": "v2",
	}
	payloadBytes, _ := json.Marshal(payload)
	gcsPath, err := deps.Store.Upload(ctx, payloadBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload sections: %w", err)
	}

	// 6. Notify gateway — it will enqueue PDF render to the beamer MS
	webhook.SendBusinessBrief(deps.GatewayURL, briefID, "completed", gcsPath, paperTitle, "")
	log.Printf("[business-brief][%s] completed: output=%s title=%q", briefID, gcsPath, paperTitle)
	return nil
}

// parseBusinessBriefSections strips code fences, parses the JSON map, and
// validates that each expected section key is present.
func parseBusinessBriefSections(raw string, expectedSections []string) (map[string]string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.Index(raw, "\n"); idx != -1 {
			raw = raw[idx+1:]
		}
		raw = strings.TrimSuffix(strings.TrimSpace(raw), "```")
		raw = strings.TrimSpace(raw)
	}
	if !strings.HasPrefix(raw, "{") {
		if idx := strings.Index(raw, "{"); idx >= 0 {
			raw = raw[idx:]
		}
	}

	var parsed map[string]string
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w — first 500 chars: %s", err, gemini.TruncateString(raw, 500))
	}

	if len(expectedSections) == 0 {
		expectedSections = []string{
			"Executive Summary", "Business Problem Addressed", "Technical Innovation Summary",
			"Business Impact", "Commercial Applications", "Implementation Considerations",
			"Risks and Limitations", "Strategic Recommendations",
		}
	}

	validated := make(map[string]string, len(expectedSections))
	for _, sec := range expectedSections {
		v := strings.TrimSpace(parsed[sec])
		if v == "" {
			v = fmt.Sprintf("Content for %s needs to be added.", sec)
		}
		validated[sec] = v
	}
	return validated, nil
}
