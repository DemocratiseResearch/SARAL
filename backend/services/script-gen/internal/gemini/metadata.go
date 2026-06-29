package gemini

import (
	"context"
	"encoding/json"
	"fmt"
)

// Metadata holds the paper fields extracted from the first ~3000 chars of text.
type Metadata struct {
	Title   string
	Authors string
	Date    string
}

// ExtractMetadata calls Gemini (flash/lite model) to pull title, authors, and
// date from the beginning of a paper's extracted text.
func ExtractMetadata(ctx context.Context, gc Provider, paperText string) (Metadata, error) {
	prompt := buildMetadataPrompt(paperText)
	raw, err := Generate(ctx, gc, ModelFlash, prompt)
	if err != nil {
		return Metadata{}, fmt.Errorf("gemini metadata call: %w", err)
	}
	return parseMetadataJSON(raw)
}

func buildMetadataPrompt(paperText string) string {
	if len(paperText) > 3000 {
		paperText = paperText[:3000]
	}
	return fmt.Sprintf(`Extract the metadata from the following research paper excerpt.
Return a JSON object with exactly these three fields:
{
  "title": "full paper title",
  "authors": "author names — if multiple, format as 'First Author et al.'",
  "date": "publication date in format 'DD Mon YYYY', e.g. '15 Jan 2024' — year only if that is all that is available"
}
If a field cannot be determined, use an empty string.
Return ONLY the JSON object. No markdown fences. No commentary.

PAPER TEXT:
%s`, paperText)
}

func parseMetadataJSON(raw string) (Metadata, error) {
	raw = StripCodeFences(raw)
	var m struct {
		Title   string `json:"title"`
		Authors string `json:"authors"`
		Date    string `json:"date"`
	}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return Metadata{}, fmt.Errorf("parse metadata JSON: %w", err)
	}
	return Metadata{Title: m.Title, Authors: m.Authors, Date: m.Date}, nil
}
