package gemini

import "context"

// TextProvider generates text from a prompt. The backend maps the logical
// model tier to its configured model.
type TextProvider interface {
	Generate(ctx context.Context, model, prompt string) (string, error)
}

// Provider is the interface for script jobs that can also use vision or grounding.
type Provider interface {
	TextProvider

	// GenerateWithGrounding calls the model with web-search grounding and,
	// where supported, dynamic/extended thinking enabled. Used only by the
	// business_brief pipeline today.
	GenerateWithGrounding(ctx context.Context, model, prompt string) (string, error)

	// GenerateVisionClassify classifies an extracted image as "figure" or
	// "logo" from a research paper, using a vision-capable model.
	GenerateVisionClassify(ctx context.Context, imageBytes []byte, paperTitle string) (bool, error)
}

// LLMMode selects which backend Clients talks to. Set via LLM_PROVIDER.
type LLMMode string

const (
	ModeVertex     LLMMode = "vertex"
	ModeGeminiAPI  LLMMode = "gemini_api"
	ModeOpenRouter LLMMode = "openrouter"
)
