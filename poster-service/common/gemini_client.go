package common

import (
	"context"
	"fmt"
	"strings"
	"log"
	"encoding/json"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type GeminiClient struct {
	client *genai.Client
	model  *genai.GenerativeModel
	textModel *genai.GenerativeModel
}

// func NewGeminiClient(apiKey string) (*GeminiClient, error) {
// 	ctx := context.Background()
// 	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
// 	if err != nil {
// 		return nil, fmt.Errorf("failed to create gemini client: %w", err)
// 	}

// 	model := client.GenerativeModel("gemini-3-flash-preview")
// 	model.SetTemperature(0.7)
// 	model.ResponseMIMEType = "application/json" 

// 	return &GeminiClient{
// 		client: client,
// 		model:  model,
// 	}, nil
// }

// func (g *GeminiClient) Close() {
// 	g.client.Close()
// }

func NewGeminiClient(apiKey string) (*GeminiClient, error) {
    ctx := context.Background()
    client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
    if err != nil {
        return nil, fmt.Errorf("failed to create gemini client: %w", err)
    }

    jsonModel := client.GenerativeModel("gemini-3-flash-preview")
    jsonModel.SetTemperature(0.7)
    jsonModel.ResponseMIMEType = "application/json"

    textModel := client.GenerativeModel("gemini-3-flash-preview")
    textModel.SetTemperature(0.7)

    return &GeminiClient{client: client, model: jsonModel, textModel: textModel}, nil
}

// GenerateText generates text from a prompt (generic method for custom prompts)
func (g *GeminiClient) GenerateText(prompt string) (string, error) {
	ctx := context.Background()
	resp, err := g.model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("gemini generation error: %w", err)
	}
	return g.extractTextFromResponse(resp)
}

func (g *GeminiClient) Close() {
    g.client.Close()
}

// PaperMetadata holds extracted paper information
type PaperMetadata struct {
	Title   string `json:"title"`
	Authors string `json:"authors"`
}

// ExtractMetadata extracts title and authors from paper text using Gemini
func (g *GeminiClient) ExtractMetadata(text string) (*PaperMetadata, error) {
	ctx := context.Background()

	// Limit text to first 2000 chars (metadata is usually at the start)
	if len(text) > 2000 {
		text = text[:2000]
	}

	prompt := fmt.Sprintf(`Extract the title and authors from this research paper text.

Return in exactly this format (no extra text):
TITLE: <paper title>
AUTHORS: <author names separated by commas>

If you cannot find the title, use "Research Paper".
If you cannot find authors, use "Authors".

Text:
%s`, text)

	resp, err := g.textModel.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return &PaperMetadata{Title: "Research Paper", Authors: "Authors"}, err
	}

	response, err := g.extractTextFromResponse(resp)
	if err != nil {
		return &PaperMetadata{Title: "Research Paper", Authors: "Authors"}, err
	}

	// Parse the response
	metadata := &PaperMetadata{Title: "Research Paper", Authors: "Authors"}
	lines := strings.Split(response, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(line), "TITLE:") {
			metadata.Title = strings.TrimSpace(strings.TrimPrefix(line, "TITLE:"))
			metadata.Title = strings.TrimPrefix(metadata.Title, ":")
			metadata.Title = strings.TrimSpace(metadata.Title)
		} else if strings.HasPrefix(strings.ToUpper(line), "AUTHORS:") {
			metadata.Authors = strings.TrimSpace(strings.TrimPrefix(line, "AUTHORS:"))
			metadata.Authors = strings.TrimPrefix(metadata.Authors, ":")
			metadata.Authors = strings.TrimSpace(metadata.Authors)
		}
	}

	return metadata, nil
}

// GenerateScript generates a video script from text (for video pipeline)
func (g *GeminiClient) GenerateScript(text string) (string, error) {
	ctx := context.Background()
	prompt := fmt.Sprintf(`
You are an expert scriptwriter for educational videos. 
Convert the following research paper text into an engaging video script.
The script should be divided into clear sections: Introduction, Methodology, Results, Discussion, Conclusion.
Write in a conversational, easy-to-understand tone.
Do not include any visual cues or camera directions, just the spoken narration.
Make it engaging and flow well.

Text:
%s
	`, text)

	resp, err := g.textModel.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("gemini generation error: %w", err)
	}

	return g.extractTextFromResponse(resp)
}

// GenerateBulletPoints generates bullet points for slides
func (g *GeminiClient) GenerateBulletPoints(sectionText string) ([]string, error) {
	ctx := context.Background()
	prompt := fmt.Sprintf(`
Summarize the following text into 3-5 concise bullet points suitable for a presentation slide.
Return ONLY the bullet points, one per line, starting with "- ".

Text:
%s
	`, sectionText)

	resp, err := g.textModel.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, fmt.Errorf("gemini generation error: %w", err)
	}

	// ✅ Print the full raw SDK response struct
	log.Printf("=== FULL GEMINI RESP ===\n%+v\n=======================\n", resp)

	text, err := g.extractTextFromResponse(resp)
	if err != nil {
		return nil, err
	}

	// ✅ Print raw response before parsing
    log.Printf("=== RAW GEMINI EXTRACTED RESPONSE ===")
    log.Printf(text)
    log.Printf("===========================")

	lines := strings.Split(text, "\n")
	var bullets []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			bullets = append(bullets, strings.TrimPrefix(strings.TrimPrefix(trimmed, "- "), "* "))
		} else if len(trimmed) > 0 {
			bullets = append(bullets, trimmed)
		}
	}
	return bullets, nil
}

// GeneratePosterContent generates structured content for a poster
func (g *GeminiClient) GeneratePosterContent(text string) (*PosterContent, error) {
	ctx := context.Background()
	prompt := fmt.Sprintf(`
You are an expert at creating academic research posters.
Analyze the following research paper and return a JSON object with EXACTLY this structure.
No markdown, no backticks, no explanation — raw JSON only.

{
  "title": "exact title extracted from the paper",
  "authors": "author names and affiliations",
  "abstract": "3-4 sentence abstract summarizing the problem, approach, and main result",
  "introduction": [
    "one sentence bullet point",
    "one sentence bullet point",
    "one sentence bullet point"
  ],
  "methodology": [
    "one sentence bullet point",
    "one sentence bullet point",
    "one sentence bullet point"
  ],
  "results": [
    "one sentence with specific metric",
    "one sentence with specific metric",
    "one sentence with specific metric"
  ],
  "conclusion": [
    "one sentence takeaway",
    "one sentence future work"
  ],
  "references": [
    "reference 1",
    "reference 2",
    "reference 3",
    "reference 4"
  ]
}

Rules:
- "title" must be extracted verbatim from the paper, not paraphrased
- Each array must have the exact number of items shown above
- Every array item is exactly ONE sentence
- Do not add any fields beyond what is shown

Paper text:
%s
	`, text)

	resp, err := g.model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, fmt.Errorf("gemini generation error: %w", err)
	}

	log.Printf("=== FULL GEMINI POSTER RESP ===\n%+v\n=======================\n", resp)

	text, err = g.extractTextFromResponse(resp)
	if err != nil {
		return nil, err
	}

	log.Printf("=== RAW POSTER CONTENT ===\n%s\n==========================\n", text)

	return parsePosterContent(text)
}

func (g *GeminiClient) extractTextFromResponse(resp *genai.GenerateContentResponse) (string, error) {
	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty response from gemini")
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if txt, ok := part.(genai.Text); ok {
			sb.WriteString(string(txt))
		}
	}

	return sb.String(), nil
}

// PosterContent holds structured poster content
type PosterContent struct {
    Title        string   `json:"title"`
    Authors      string   `json:"authors"`
    Abstract     string   `json:"abstract"`
    Introduction []string `json:"introduction"`
    Methodology  []string `json:"methodology"`
    Results      []string `json:"results"`
    Conclusion   []string `json:"conclusion"`
    References   []string `json:"references"`
}


func parsePosterContent(rawText string) (*PosterContent, error) {
    rawText = strings.TrimSpace(rawText)
    rawText = strings.TrimPrefix(rawText, "```json")
    rawText = strings.TrimPrefix(rawText, "```")
    rawText = strings.TrimSuffix(rawText, "```")
    rawText = strings.TrimSpace(rawText)

    var content PosterContent
    if err := json.Unmarshal([]byte(rawText), &content); err != nil {
        return nil, fmt.Errorf("failed to parse gemini JSON response: %w\nraw: %s", err, rawText)
    }

    return &content, nil
}


// // parsePosterContent parses the AI response into structured content
// func parsePosterContent(text string) *PosterContent {
// 	content := &PosterContent{}
// 	lines := strings.Split(text, "\n")

// 	currentSection := ""
// 	var currentBuffer strings.Builder

// 	extractBullets := func(text string) []string {
// 		var bullets []string
// 		for _, line := range strings.Split(text, "\n") {
// 			trimmed := strings.TrimSpace(line)
// 			if strings.HasPrefix(trimmed, "- ") {
// 				bullets = append(bullets, strings.TrimPrefix(trimmed, "- "))
// 			} else if strings.HasPrefix(trimmed, "* ") {
// 				bullets = append(bullets, strings.TrimPrefix(trimmed, "* "))
// 			} else if len(trimmed) > 0 && !strings.Contains(strings.ToUpper(trimmed), ":") {
// 				bullets = append(bullets, trimmed)
// 			}
// 		}
// 		log.Printf("Extracted bullets for section %s: %v\n", currentSection, bullets)
// 		return bullets
// 	}

// 	saveSection := func() {
// 		bufText := strings.TrimSpace(currentBuffer.String())
// 		switch currentSection {
// 		case "TITLE":
// 			content.Title = bufText
// 		case "AUTHORS":
// 			content.Authors = bufText
// 		case "ABSTRACT":
// 			content.Abstract = bufText
// 		case "INTRODUCTION":
// 			content.Introduction = extractBullets(bufText)
// 		case "METHODOLOGY":
// 			content.Methodology = extractBullets(bufText)
// 		case "RESULTS":
// 			content.Results = extractBullets(bufText)
// 		case "CONCLUSION":
// 			content.Conclusion = extractBullets(bufText)
// 		case "REFERENCES":
// 			content.References = extractBullets(bufText)
// 		}
// 	}

// 	sectionHeaders := []string{"TITLE:", "AUTHORS:", "ABSTRACT:", "INTRODUCTION:", "METHODOLOGY:", "RESULTS:", "CONCLUSION:", "REFERENCES:"}

// 	for _, line := range lines {
// 		trimmed := strings.TrimSpace(line)
// 		foundHeader := false

// 		for _, header := range sectionHeaders {
// 			if strings.HasPrefix(strings.ToUpper(trimmed), header) {
// 				saveSection()
// 				currentSection = strings.TrimSuffix(header, ":")
// 				currentBuffer.Reset()
// 				// Check if there's content after the header on the same line
// 				remainder := strings.TrimSpace(strings.TrimPrefix(strings.ToUpper(trimmed), header))
// 				if remainder != "" {
// 					// Get the original case remainder
// 					idx := strings.Index(strings.ToUpper(trimmed), header)
// 					if idx >= 0 {
// 						actualRemainder := strings.TrimSpace(trimmed[idx+len(header):])
// 						currentBuffer.WriteString(actualRemainder)
// 						currentBuffer.WriteString("\n")
// 					}
// 				}
// 				foundHeader = true
// 				break
// 			}
// 		}

// 		if !foundHeader && currentSection != "" {
// 			currentBuffer.WriteString(line)
// 			currentBuffer.WriteString("\n")
// 		}
// 	}
// 	saveSection()

// 	return content
// }
