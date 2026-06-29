package pipeline

import (
	"context"

	"github.com/saral/script-gen/internal/config"
)

// ── Shared output types ───────────────────────────────────────────────────────

// Section is a single slide in a video/deck script.
type Section struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Narration string   `json:"narration"`
	Bullets   []string `json:"bullets"`
}

// Script is the output of the standard / slides-deck / patent pipelines.
type Script struct {
	RunID            string            `json:"run_id"`
	AudienceLevel    string            `json:"audience_level,omitempty"`
	Tone             string            `json:"tone,omitempty"`
	TitleIntro       string            `json:"title_intro,omitempty"`
	Title            string            `json:"title,omitempty"`
	Authors          string            `json:"authors,omitempty"`
	Date             string            `json:"date,omitempty"`
	Sections         []Section         `json:"sections"`
	ImageAssignments map[string]string `json:"image_assignments,omitempty"`
	Language         string            `json:"language,omitempty"`
	OutputFormat     string            `json:"output_format,omitempty"`
	PPTTemplate      string            `json:"ppt_template,omitempty"`
	VoiceGender      string            `json:"voice_gender,omitempty"`
}

// ExtractedDocument is the JSON produced by the PDF-parser worker and stored
// in GCS. Every pipeline downloads and decodes this before calling Gemini.
type ExtractedDocument struct {
	Text       string   `json:"text"`
	NumPages   int      `json:"num_pages"`
	ImagePaths []string `json:"image_paths"`
}

// ── Interfaces ────────────────────────────────────────────────────────────────

// GCSClient abstracts the storage layer so pipelines are testable without real GCS.
type GCSClient interface {
	Download(ctx context.Context, gcsPath string) ([]byte, error)
	Upload(ctx context.Context, data []byte, objectKey, contentType string) (string, error)
}

// ── Shared deps struct ────────────────────────────────────────────────────────

// Deps bundles the external dependencies every pipeline function needs.
// Keeping them in one struct means adding a new dependency doesn't require
// touching every function signature across all pipeline files.
type Deps struct {
	Store      GCSClient
	GatewayURL string
	Prompts    config.PromptConfig
}
