package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/vertexai/genai"
	"github.com/saral/gateway/internal/models"
)

const defaultModel = "gemini-3.6-flash"
const defaultLocation = "us-central1"

// GroundingSystemInstruction strictly forbids hallucination.
const GroundingSystemInstruction = `You are SARAL's expert AI research assistant. You are answering questions about the research paper provided.
GROUNDING RULES (STRICTLY ENFORCED):
1. Answer ONLY using facts, definitions, data, and conclusions directly stated in the paper text.
2. If the answer cannot be found in or deduced from the paper, you MUST explicitly state: "This information is not found in the paper."
3. Do NOT extrapolate, speculate, or fabricate citations, numbers, or external claims.
4. Keep answers concise, objective, and well-structured using clear Markdown formatting.`

// Generate runs a single-shot prompt against Vertex AI (kept for backward compatibility).
func Generate(ctx context.Context, prompt string) (string, error) {
	projectID := os.Getenv("GCP_PROJECT_ID")
	if projectID == "" {
		return "", fmt.Errorf("vertex: GCP_PROJECT_ID not set")
	}
	location := os.Getenv("GCP_LOCATION")
	if location == "" {
		location = defaultLocation
	}
	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = defaultModel
	}

	client, err := genai.NewClient(ctx, projectID, location)
	if err != nil {
		return "", fmt.Errorf("vertex: create client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel(modelName)
	model.SetTemperature(0.3)
	model.ResponseMIMEType = "application/json"

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("vertex: generate content: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("vertex: empty response")
	}

	part := resp.Candidates[0].Content.Parts[0]
	text, ok := part.(genai.Text)
	if !ok {
		return "", fmt.Errorf("vertex: unexpected response part type %T", part)
	}

	return string(text), nil
}

// GenerateChat answers a user question grounded in paper text and prior chat history.
// It prioritizes GEMINI_API_KEY (direct Google AI Studio API) when set (or user-supplied key),
// and falls back to Vertex AI if GCP_PROJECT_ID is configured.
func GenerateChat(
	ctx context.Context,
	paperText string,
	history []models.ChatMessage,
	userMessage string,
	userKey string,
) (string, error) {
	apiKey := userKey
	if apiKey == "" {
		apiKey = os.Getenv("GEMINI_API_KEY")
	}

	// 1. If API key is available (standard for local dev and direct API users), use REST API
	if apiKey != "" {
		return generateChatREST(ctx, apiKey, paperText, history, userMessage)
	}

	// 2. Otherwise fall back to Vertex AI if GCP_PROJECT_ID is configured
	projectID := os.Getenv("GCP_PROJECT_ID")
	if projectID != "" {
		return generateChatVertex(ctx, projectID, paperText, history, userMessage)
	}

	return "", fmt.Errorf("neither GEMINI_API_KEY nor GCP_PROJECT_ID is configured")
}

// generateChatREST calls the Google AI Studio Gemini API directly.
func generateChatREST(
	ctx context.Context,
	apiKey string,
	paperText string,
	history []models.ChatMessage,
	userMessage string,
) (string, error) {
	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = defaultModel
	}

	type part struct {
		Text string `json:"text"`
	}
	type content struct {
		Role  string `json:"role,omitempty"` // "user" or "model"
		Parts []part `json:"parts"`
	}
	type genConfig struct {
		Temperature float32 `json:"temperature"`
	}
	type reqBody struct {
		SystemInstruction *content  `json:"systemInstruction,omitempty"`
		Contents          []content `json:"contents"`
		GenerationConfig  genConfig `json:"generationConfig"`
	}

	var contents []content

	// First user turn provides the full paper text as context
	firstPrompt := fmt.Sprintf("Here is the research paper text:\n\n---\n%s\n---\n\nInitial query: Please acknowledge receipt of the paper and stand by for questions.", paperText)
	contents = append(contents,
		content{
			Role:  "user",
			Parts: []part{{Text: firstPrompt}},
		},
		content{
			Role:  "model",
			Parts: []part{{Text: "I have reviewed the paper text and am ready to answer questions based strictly on its content."}},
		},
	)

	// Append prior history turns
	for _, m := range history {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, content{
			Role:  role,
			Parts: []part{{Text: m.Content}},
		})
	}

	// Append current user query
	contents = append(contents, content{
		Role:  "user",
		Parts: []part{{Text: userMessage}},
	})

	req := reqBody{
		SystemInstruction: &content{
			Parts: []part{{Text: GroundingSystemInstruction}},
		},
		Contents: contents,
		GenerationConfig: genConfig{
			Temperature: 0.2,
		},
	}

	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal chat request: %w", err)
	}

	endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", modelName, apiKey)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create chat http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 90 * time.Second}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("gemini chat request failed: %w", err)
	}
	defer resp.Body.Close()

	respRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read chat response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Error struct {
				Message string `json:"message"`
				Code    int    `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(respRaw, &errResp)
		if errResp.Error.Message != "" {
			return "", fmt.Errorf("gemini api error (%d): %s", resp.StatusCode, errResp.Error.Message)
		}
		return "", fmt.Errorf("gemini api error (status %d)", resp.StatusCode)
	}

	var parsedResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respRaw, &parsedResp); err != nil {
		return "", fmt.Errorf("decode gemini response: %w", err)
	}

	if len(parsedResp.Candidates) == 0 || len(parsedResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini returned empty candidates")
	}

	var sb strings.Builder
	for _, p := range parsedResp.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	return strings.TrimSpace(sb.String()), nil
}

// generateChatVertex calls Vertex AI Gemini.
func generateChatVertex(
	ctx context.Context,
	projectID string,
	paperText string,
	history []models.ChatMessage,
	userMessage string,
) (string, error) {
	location := os.Getenv("GCP_LOCATION")
	if location == "" {
		location = defaultLocation
	}
	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = defaultModel
	}

	client, err := genai.NewClient(ctx, projectID, location)
	if err != nil {
		return "", fmt.Errorf("vertex client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel(modelName)
	model.SetTemperature(0.2)
	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(GroundingSystemInstruction)},
	}

	cs := model.StartChat()

	// Seed paper text in chat history
	firstPrompt := fmt.Sprintf("Here is the research paper text:\n\n---\n%s\n---\n\nInitial query: Please acknowledge receipt of the paper and stand by for questions.", paperText)
	cs.History = []*genai.Content{
		{
			Role:  "user",
			Parts: []genai.Part{genai.Text(firstPrompt)},
		},
		{
			Role:  "model",
			Parts: []genai.Part{genai.Text("I have reviewed the paper text and am ready to answer questions based strictly on its content.")},
		},
	}

	for _, m := range history {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		cs.History = append(cs.History, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(m.Content)},
		})
	}

	resp, err := cs.SendMessage(ctx, genai.Text(userMessage))
	if err != nil {
		return "", fmt.Errorf("vertex send message: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("vertex: empty response")
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if text, ok := part.(genai.Text); ok {
			sb.WriteString(string(text))
		}
	}
	return strings.TrimSpace(sb.String()), nil
}
