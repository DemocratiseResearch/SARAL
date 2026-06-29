package gemini

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

const (
	ModelFlash = "gemini-2.5-flash"
	ModelPro   = "gemini-2.5-pro"
)

// Clients holds the Flash and Pro providers used by script-gen. In gemini_api
// and openrouter modes Flash and Pro may be the *same* underlying provider
// instance — the model string passed at call time is what actually selects
// Flash vs. Pro behavior. Only vertex mode needs two distinct clients
// (different GCP regions).
type Clients struct {
	Flash Provider
	Pro   Provider

	mode      LLMMode
	orFlash   string
	orPro     string
	orSiteURL string
	orSiteNm  string
}

// ClientsConfig carries every env-derived setting NewClients needs.
type ClientsConfig struct {
	Mode LLMMode

	// vertex
	GCPProject  string
	FlashRegion string
	ProRegion   string

	// gemini_api
	GeminiAPIKey string

	// openrouter
	OpenRouterAPIKey     string
	OpenRouterFlashModel string
	OpenRouterProModel   string
	OpenRouterSiteURL    string
	OpenRouterSiteName   string
}

// NewClients initialises the provider(s) for the configured backend.
// Call once at startup; reuse across all jobs.
func NewClients(ctx context.Context, cfg ClientsConfig) (*Clients, error) {
	switch cfg.Mode {
	case ModeVertex:
		flash, err := genai.NewClient(ctx, &genai.ClientConfig{
			Project:  cfg.GCPProject,
			Location: cfg.FlashRegion,
			Backend:  genai.BackendVertexAI,
		})
		if err != nil {
			return nil, fmt.Errorf("gemini flash client (vertex): %w", err)
		}
		pro, err := genai.NewClient(ctx, &genai.ClientConfig{
			Project:  cfg.GCPProject,
			Location: cfg.ProRegion,
			Backend:  genai.BackendVertexAI,
		})
		if err != nil {
			return nil, fmt.Errorf("gemini pro client (vertex): %w", err)
		}
		return &Clients{Flash: &genaiProvider{client: flash}, Pro: &genaiProvider{client: pro}, mode: cfg.Mode}, nil

	case ModeGeminiAPI:
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("GEMINI_API_KEY is required when LLM_PROVIDER=gemini_api")
		}
		c, err := genai.NewClient(ctx, &genai.ClientConfig{
			APIKey:  cfg.GeminiAPIKey,
			Backend: genai.BackendGeminiAPI,
		})
		if err != nil {
			return nil, fmt.Errorf("gemini developer api client: %w", err)
		}
		p := &genaiProvider{client: c}
		return &Clients{Flash: p, Pro: p, mode: cfg.Mode}, nil

	case ModeOpenRouter:
		if cfg.OpenRouterAPIKey == "" {
			return nil, fmt.Errorf("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter")
		}
		p := newOpenRouterProvider(cfg.OpenRouterAPIKey, cfg.OpenRouterFlashModel, cfg.OpenRouterProModel, cfg.OpenRouterSiteURL, cfg.OpenRouterSiteName)
		return &Clients{
			Flash: p, Pro: p, mode: cfg.Mode,
			orFlash: cfg.OpenRouterFlashModel, orPro: cfg.OpenRouterProModel,
			orSiteURL: cfg.OpenRouterSiteURL, orSiteNm: cfg.OpenRouterSiteName,
		}, nil

	default:
		return nil, fmt.Errorf("unknown LLM_PROVIDER %q (want vertex | gemini_api | openrouter)", cfg.Mode)
	}
}

// ResolveFlash returns a per-job provider when userKey is set (lets a job
// bring its own API key for the active backend), otherwise the shared Flash
// provider. The bool result is kept for call-site compatibility.
func (c *Clients) ResolveFlash(ctx context.Context, userKey string) (Provider, bool, error) {
	return c.resolve(ctx, userKey, c.Flash)
}

// ResolvePro is the Pro-model equivalent of ResolveFlash.
func (c *Clients) ResolvePro(ctx context.Context, userKey string) (Provider, bool, error) {
	return c.resolve(ctx, userKey, c.Pro)
}

func (c *Clients) resolve(ctx context.Context, userKey string, shared Provider) (Provider, bool, error) {
	if userKey == "" {
		return shared, false, nil
	}
	if c.mode == ModeOpenRouter {
		return newOpenRouterProvider(userKey, c.orFlash, c.orPro, c.orSiteURL, c.orSiteNm), true, nil
	}
	cl, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  userKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, false, fmt.Errorf("user gemini client: %w", err)
	}
	return &genaiProvider{client: cl}, true, nil
}

// ── genai-backed Provider (used by both vertex and gemini_api modes) ───────

type genaiProvider struct {
	client *genai.Client
}

func (p *genaiProvider) Generate(ctx context.Context, model, prompt string) (string, error) {
	resp, err := p.client.Models.GenerateContent(ctx, model, genai.Text(prompt), &genai.GenerateContentConfig{
		Temperature: genai.Ptr[float32](0.4),
	})
	if err != nil {
		return "", fmt.Errorf("GenerateContent (model=%s): %w", model, err)
	}
	text := resp.Text()
	if text == "" {
		return "", fmt.Errorf("empty response from Gemini (model=%s)", model)
	}
	return text, nil
}

func (p *genaiProvider) GenerateWithGrounding(ctx context.Context, model, prompt string) (string, error) {
	thinkingBudget := int32(-1)
	cfg := &genai.GenerateContentConfig{
		Tools:          []*genai.Tool{{GoogleSearch: &genai.GoogleSearch{}}},
		ThinkingConfig: &genai.ThinkingConfig{ThinkingBudget: &thinkingBudget},
		Temperature:    genai.Ptr[float32](0.6),
	}
	resp, err := p.client.Models.GenerateContent(ctx, model, genai.Text(prompt), cfg)
	if err != nil {
		return "", fmt.Errorf("GenerateContent with grounding (model=%s): %w", model, err)
	}
	text := resp.Text()
	if text == "" {
		return "", fmt.Errorf("empty response from Gemini grounding call (model=%s)", model)
	}
	return text, nil
}

func (p *genaiProvider) GenerateVisionClassify(ctx context.Context, imageBytes []byte, paperTitle string) (bool, error) {
	content := []*genai.Content{
		{
			Role: "user",
			Parts: []*genai.Part{
				{Text: visionClassifyPrompt(paperTitle)},
				{InlineData: &genai.Blob{MIMEType: "image/png", Data: imageBytes}},
			},
		},
	}
	resp, err := p.client.Models.GenerateContent(ctx, ModelFlash, content, nil)
	if err != nil {
		return false, fmt.Errorf("gemini vision classify: %w", err)
	}
	answer := strings.TrimSpace(resp.Text())
	return strings.HasPrefix(strings.ToLower(answer), "figure"), nil
}

// visionClassifyPrompt is shared by genaiProvider and openRouterProvider so
// both backends classify images with byte-identical instructions.
func visionClassifyPrompt(paperTitle string) string {
	return fmt.Sprintf(`You are helping filter images extracted from a research paper titled "%s".

Look at this image and answer with exactly one word:
- "figure" if this is a scientific figure, graph, diagram, chart, table, or any content-relevant illustration from the paper
- "logo" if this is a journal logo, university seal, sponsor badge, decorative banner, watermark, or any non-content decoration

Answer:`, paperTitle)
}

// Generate, GenerateWithGrounding, and GenerateVisionClassify are kept as
// package-level functions so pipeline/*.go call sites need ZERO changes —
// they already call gemini.Generate(ctx, gc, model, prompt) etc.
//
// Generate delegates to the Provider's Generate method.
func Generate(ctx context.Context, gc Provider, model, prompt string) (string, error) {
	return gc.Generate(ctx, model, prompt)
}

// GenerateWithGrounding delegates to the Provider's GenerateWithGrounding method.
func GenerateWithGrounding(ctx context.Context, gc Provider, model, prompt string) (string, error) {
	return gc.GenerateWithGrounding(ctx, model, prompt)
}

// GenerateVisionClassify delegates to the Provider's GenerateVisionClassify method.
func GenerateVisionClassify(ctx context.Context, gc Provider, imageBytes []byte, paperTitle string) (bool, error) {
	return gc.GenerateVisionClassify(ctx, imageBytes, paperTitle)
}
