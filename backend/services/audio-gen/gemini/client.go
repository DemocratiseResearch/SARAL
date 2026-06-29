package gemini

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/saral/audio-gen/wav"
)

const (
	defaultBaseURL          = "https://generativelanguage.googleapis.com/v1beta"
	defaultTranslationModel = "gemini-2.5-flash"
	defaultTTSModel         = "gemini-2.5-flash-preview-tts"
	pcmSampleRate           = 24000
	pcmChannels             = 1
	pcmBitsPerSample        = 16
)

type Client struct {
	APIKey           string
	BaseURL          string
	TranslationModel string
	TTSModel         string
}

func (c *Client) Translate(text, targetLang string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", fmt.Errorf("gemini api key not configured")
	}

	model := c.TranslationModel
	if model == "" {
		model = defaultTranslationModel
	}
	targetName := languageName(targetLang)
	prompt := fmt.Sprintf(
		"Translate the following text from English to %s. Return only the translated text, with no quotes, markdown, explanations, or extra commentary.\n\n%s",
		targetName,
		text,
	)

	req := generateContentRequest{
		Contents: []content{{Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{
			Temperature: floatPtr(0.2),
		},
	}
	var resp generateContentResponse
	if err := c.doGenerate(model, req, &resp); err != nil {
		return "", err
	}
	translated := strings.TrimSpace(resp.firstText())
	if translated == "" {
		return "", fmt.Errorf("gemini translate: empty response")
	}
	return translated, nil
}

func (c *Client) Synthesize(text, targetLang, speaker string) ([]byte, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return nil, fmt.Errorf("gemini api key not configured")
	}

	model := c.TTSModel
	if model == "" {
		model = defaultTTSModel
	}
	voiceName := voiceForSpeaker(speaker)
	targetName := languageName(targetLang)
	prompt := fmt.Sprintf("Say clearly in %s:\n%s", targetName, text)

	req := generateContentRequest{
		Contents: []content{{Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{
			ResponseModalities: []string{"AUDIO"},
			SpeechConfig: &speechConfig{
				VoiceConfig: &voiceConfig{
					PrebuiltVoiceConfig: &prebuiltVoiceConfig{VoiceName: voiceName},
				},
			},
		},
	}
	var resp generateContentResponse
	if err := c.doGenerate(model, req, &resp); err != nil {
		return nil, err
	}
	audioData := resp.firstInlineData()
	if audioData.Data == "" {
		return nil, fmt.Errorf("gemini TTS: empty audio response")
	}
	audio, err := base64.StdEncoding.DecodeString(audioData.Data)
	if err != nil {
		return nil, fmt.Errorf("gemini TTS base64 decode: %w", err)
	}
	if strings.Contains(strings.ToLower(audioData.MimeType), "wav") || wav.HasHeader(audio) {
		return audio, nil
	}
	return wav.Encode(audio, pcmSampleRate, pcmChannels, pcmBitsPerSample), nil
}

func (c *Client) doGenerate(model string, req generateContentRequest, out *generateContentResponse) error {
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal gemini request: %w", err)
	}
	baseURL := c.BaseURL
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	url := fmt.Sprintf("%s/models/%s:generateContent", strings.TrimRight(baseURL, "/"), model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", c.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("gemini HTTP: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("gemini %d: %s", resp.StatusCode, string(errBody))
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("gemini decode: %w", err)
	}
	return nil
}

type generateContentRequest struct {
	Contents         []content         `json:"contents"`
	GenerationConfig *generationConfig `json:"generationConfig,omitempty"`
}

type generationConfig struct {
	ResponseModalities []string      `json:"responseModalities,omitempty"`
	SpeechConfig       *speechConfig `json:"speechConfig,omitempty"`
	Temperature        *float64      `json:"temperature,omitempty"`
}

type speechConfig struct {
	VoiceConfig *voiceConfig `json:"voiceConfig,omitempty"`
}

type voiceConfig struct {
	PrebuiltVoiceConfig *prebuiltVoiceConfig `json:"prebuiltVoiceConfig,omitempty"`
}

type prebuiltVoiceConfig struct {
	VoiceName string `json:"voiceName"`
}

type content struct {
	Parts []part `json:"parts"`
}

type part struct {
	Text       string      `json:"text,omitempty"`
	InlineData *inlineData `json:"inlineData,omitempty"`
}

type inlineData struct {
	MimeType string `json:"mimeType,omitempty"`
	Data     string `json:"data,omitempty"`
}

type generateContentResponse struct {
	Candidates []struct {
		Content content `json:"content"`
	} `json:"candidates"`
}

func (r generateContentResponse) firstText() string {
	for _, candidate := range r.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.Text != "" {
				return part.Text
			}
		}
	}
	return ""
}

func (r generateContentResponse) firstInlineData() inlineData {
	for _, candidate := range r.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData != nil && part.InlineData.Data != "" {
				return *part.InlineData
			}
		}
	}
	return inlineData{}
}

func languageName(lang string) string {
	switch lang {
	case "pt-BR":
		return "Brazilian Portuguese"
	case "pt-PT":
		return "European Portuguese"
	case "pt":
		return "Portuguese"
	default:
		return lang
	}
}

func voiceForSpeaker(speaker string) string {
	switch strings.ToLower(strings.TrimSpace(speaker)) {
	case "aditya", "shubh", "aayan":
		return "Puck"
	default:
		return "Kore"
	}
}

func floatPtr(v float64) *float64 {
	return &v
}
