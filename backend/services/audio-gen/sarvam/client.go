package sarvam

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const apiURL = "https://api.sarvam.ai/text-to-speech"


var SarvamLanguages = map[string]string{
	"en-IN": "en-IN",
	"hi-IN": "hi-IN",
	"bn-IN": "bn-IN",
	"ta-IN": "ta-IN",
	"te-IN": "te-IN",
	"kn-IN": "kn-IN",
	"ml-IN": "ml-IN",
	"mr-IN": "mr-IN",
	"gu-IN": "gu-IN",
	"pa-IN": "pa-IN",
	"od-IN": "od-IN",
}


var LanguageToDisplayName = map[string]string{
	"hi-IN": "Hindi",
	"bn-IN": "Bengali",
	"ta-IN": "Tamil",
	"te-IN": "Telugu",
	"kn-IN": "Kannada",
	"ml-IN": "Malayalam",
	"mr-IN": "Marathi",
	"gu-IN": "Gujarati",
	"pa-IN": "Punjabi",
	"od-IN": "Odia",
}

type Client struct {
	APIKey string
}

type TTSRequest struct {
	Inputs              []string `json:"inputs"`
	TargetLang          string   `json:"target_language_code"`
	Speaker             string   `json:"speaker"`
	Model               string   `json:"model"`
	EnablePreprocessing bool     `json:"enable_preprocessing"`
	SpeechSampleRate    int      `json:"speech_sample_rate"`
	Pace                float32  `json:"pace"`
}

type ttsResponse struct {
	Audios []string `json:"audios"`
}

// Synthesize calls Sarvam TTS and returns raw WAV bytes.
func (c *Client) Synthesize(text, langCode, speaker string) ([]byte, error) {
	req := TTSRequest{
		Inputs:              []string{text},
		TargetLang:          langCode,
		Speaker:             speaker,
		Model:               "bulbul:v3",
		EnablePreprocessing: true,
		SpeechSampleRate:    22050,
		Pace:                1.1,
	}
	body, _ := json.Marshal(req)

	httpReq, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("api-subscription-key", c.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sarvam HTTP: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sarvam TTS %d: %s", resp.StatusCode, string(errBody))
	}

	var result ttsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("sarvam decode: %w", err)
	}
	if len(result.Audios) == 0 {
		return nil, fmt.Errorf("sarvam: empty audio list")
	}

	wav, err := base64.StdEncoding.DecodeString(result.Audios[0])
	if err != nil {
		return nil, fmt.Errorf("sarvam base64 decode: %w", err)
	}
	return wav, nil
}
