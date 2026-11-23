package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const openAIResponsesURL = "https://api.openai.com/v1/responses"

type openAITextProvider struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewOpenAIXDraftProvider enables direct OpenAI only when an X-draft model is configured.
func NewOpenAIXDraftProvider(apiKey, model string) (TextProvider, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return nil, nil
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY is required when X_DRAFT_OPENAI_MODEL is set")
	}
	return &openAITextProvider{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: 90 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}

func (p *openAITextProvider) Generate(ctx context.Context, _ string, prompt string) (string, error) {
	payload := struct {
		Model           string `json:"model"`
		Input           string `json:"input"`
		Store           bool   `json:"store"`
		MaxOutputTokens int    `json:"max_output_tokens"`
	}{
		Model:           p.model,
		Input:           prompt,
		Store:           false,
		MaxOutputTokens: 4096,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("openai: encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIResponsesURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("openai: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai: request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai: Responses API returned HTTP %d", resp.StatusCode)
	}

	var result struct {
		Status string `json:"status"`
		Output []struct {
			Type    string `json:"type"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("openai: decode response: %w", err)
	}
	if result.Status != "completed" {
		return "", fmt.Errorf("openai: response status %q", result.Status)
	}

	var output strings.Builder
	for _, item := range result.Output {
		if item.Type != "message" {
			continue
		}
		for _, part := range item.Content {
			if part.Type == "output_text" {
				output.WriteString(part.Text)
			}
		}
	}
	if strings.TrimSpace(output.String()) == "" {
		return "", fmt.Errorf("openai: response contained no text")
	}
	return output.String(), nil
}
