package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const openRouterChatURL = "https://openrouter.ai/api/v1/chat/completions"

// openRouterProvider adapts OpenRouter's OpenAI-compatible chat-completions
// API to the Provider interface. OpenRouter has no native Gemini
// "generateContent" endpoint — every request, regardless of which model it
// routes to, goes through POST /api/v1/chat/completions with an
// OpenAI-shaped body.
type openRouterProvider struct {
	apiKey     string
	flashModel string
	proModel   string
	siteURL    string
	siteName   string
	httpClient *http.Client
}

func newOpenRouterProvider(apiKey, flashModel, proModel, siteURL, siteName string) *openRouterProvider {
	if flashModel == "" {
		flashModel = "google/gemini-2.5-flash"
	}
	if proModel == "" {
		proModel = "google/gemini-2.5-pro"
	}
	return &openRouterProvider{
		apiKey:     apiKey,
		flashModel: flashModel,
		proModel:   proModel,
		siteURL:    siteURL,
		siteName:   siteName,
		httpClient: &http.Client{Timeout: 180 * time.Second},
	}
}

// resolveModel translates a logical Gemini model name (ModelFlash/ModelPro)
// into the OpenRouter slug to actually request.
func (p *openRouterProvider) resolveModel(model string) string {
	switch model {
	case ModelFlash:
		return p.flashModel
	case ModelPro:
		return p.proModel
	default:
		if strings.Contains(model, "/") {
			return model
		}
		return "google/" + model
	}
}

type orMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type orContentPart struct {
	Type     string      `json:"type"`
	Text     string      `json:"text,omitempty"`
	ImageURL *orImageURL `json:"image_url,omitempty"`
}

type orImageURL struct {
	URL string `json:"url"`
}

type orReasoning struct {
	Effort string `json:"effort,omitempty"`
}

type orTool struct {
	Type string `json:"type"`
}

type orRequest struct {
	Model       string       `json:"model"`
	Messages    []orMessage  `json:"messages"`
	Temperature *float32     `json:"temperature,omitempty"`
	Tools       []orTool     `json:"tools,omitempty"`
	Reasoning   *orReasoning `json:"reasoning,omitempty"`
}

type orResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func ptr32(f float32) *float32 { return &f }

func (p *openRouterProvider) chat(ctx context.Context, req orRequest) (string, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("openrouter: marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterChatURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("openrouter: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	if p.siteURL != "" {
		httpReq.Header.Set("HTTP-Referer", p.siteURL)
	}
	if p.siteName != "" {
		httpReq.Header.Set("X-Title", p.siteName)
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("openrouter: request failed (model=%s): %w", req.Model, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("openrouter: read response (model=%s): %w", req.Model, err)
	}

	var parsed orResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("openrouter: decode response (model=%s, status=%d): %w", req.Model, resp.StatusCode, err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("openrouter API error (model=%s, status=%d): %s", req.Model, resp.StatusCode, parsed.Error.Message)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openrouter: unexpected status %d (model=%s): %s", resp.StatusCode, req.Model, string(raw))
	}
	if len(parsed.Choices) == 0 || parsed.Choices[0].Message.Content == "" {
		return "", fmt.Errorf("empty response from OpenRouter (model=%s)", req.Model)
	}
	return parsed.Choices[0].Message.Content, nil
}

func (p *openRouterProvider) Generate(ctx context.Context, model, prompt string) (string, error) {
	req := orRequest{
		Model:       p.resolveModel(model),
		Messages:    []orMessage{{Role: "user", Content: prompt}},
		Temperature: ptr32(0.4),
	}
	return p.chat(ctx, req)
}

// GenerateWithGrounding uses OpenRouter's web_search server tool, which lets
// the model decide whether and how often to search. This is an approximation
// of Gemini's native GoogleSearch grounding — validate business_brief output
// quality side-by-side before cutting production traffic over.
func (p *openRouterProvider) GenerateWithGrounding(ctx context.Context, model, prompt string) (string, error) {
	req := orRequest{
		Model:       p.resolveModel(model),
		Messages:    []orMessage{{Role: "user", Content: prompt}},
		Temperature: ptr32(0.6),
		Tools:       []orTool{{Type: "openrouter:web_search"}},
		Reasoning:   &orReasoning{Effort: "high"},
	}
	return p.chat(ctx, req)
}

func (p *openRouterProvider) GenerateVisionClassify(ctx context.Context, imageBytes []byte, paperTitle string) (bool, error) {
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	req := orRequest{
		Model: p.resolveModel(ModelFlash),
		Messages: []orMessage{
			{
				Role: "user",
				Content: []orContentPart{
					{Type: "text", Text: visionClassifyPrompt(paperTitle)},
					{Type: "image_url", ImageURL: &orImageURL{URL: dataURL}},
				},
			},
		},
		Temperature: ptr32(0.0),
	}
	answer, err := p.chat(ctx, req)
	if err != nil {
		return false, fmt.Errorf("openrouter vision classify: %w", err)
	}
	answer = strings.TrimSpace(answer)
	return strings.HasPrefix(strings.ToLower(answer), "figure"), nil
}
