package gemini

import (
	"context"
	"fmt"
	"os"

	"cloud.google.com/go/vertexai/genai"
)

const defaultModel = "gemini-2.5-flash"
const defaultLocation = "us-central1"


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
