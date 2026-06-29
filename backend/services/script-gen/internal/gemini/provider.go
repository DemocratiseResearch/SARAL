package gemini

import "context"

// Provider is the transport-agnostic interface every LLM backend implements.
// pipeline/*.go and the package-level Generate/GenerateWithGrounding/
// GenerateVisionClassify helpers only ever depend on this interface — never
// on *genai.Client or anything OpenRouter-specific — so adding a fourth
// backend later never requires touching pipeline code.
type Provider interface {
	// Generate calls the model with a plain text prompt at low temperature.
	// model is the logical Gemini model name (ModelFlash or ModelPro); each
	// implementation translates it into whatever identifier its backend
	// actually expects.
	Generate(ctx context.Context, model, prompt string) (string, error)

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
