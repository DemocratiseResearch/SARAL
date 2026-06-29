package sarvam

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const translateURL = "https://api.sarvam.ai/translate"

// MayuraV1Languages lists the BCP-47 codes supported by the mayura:v1 model.
// These receive classic-colloquial mode which produces natural code-mixed output
// (target language + English). Source is always en-IN.
var MayuraV1Languages = map[string]bool{
	"bn-IN": true,
	"gu-IN": true,
	"hi-IN": true,
	"kn-IN": true,
	"ml-IN": true,
	"mr-IN": true,
	"od-IN": true,
	"pa-IN": true,
	"ta-IN": true,
	"te-IN": true,
	// en-IN is in mayura:v1 but we never translate English → English.
}

// SarvamTranslateV1Languages lists BCP-47 codes that are supported only by
// sarvam-translate:v1 (not by mayura:v1). Only formal mode is supported.
var SarvamTranslateV1Languages = map[string]bool{
	"as-IN":  true, // Assamese
	"brx-IN": true, // Bodo
	"doi-IN": true, // Dogri
	"kok-IN": true, // Konkani
	"mai-IN": true, // Maithili
	"mni-IN": true, // Manipuri (Meiteilon)
	"ne-IN":  true, // Nepali
	"sa-IN":  true, // Sanskrit
	"sat-IN": true, // Santali
	"ur-IN":  true, // Urdu
}

type translateRequest struct {
	Input              string `json:"input"`
	SourceLanguageCode string `json:"source_language_code"`
	TargetLanguageCode string `json:"target_language_code"`
	Model              string `json:"model"`
	Mode               string `json:"mode,omitempty"`
	NumeralsFormat     string `json:"numerals_format,omitempty"`
}

type translateResponse struct {
	TranslatedText     string `json:"translated_text"`
	SourceLanguageCode string `json:"source_language_code"`
	RequestID          string `json:"request_id"`
}


// Model selection:
//   - mayura:v1           → 10 core Indic languages, classic-colloquial mode
//   - sarvam-translate:v1 → 8 extended languages, formal mode only

func (c *Client) Translate(text, targetLangCode string, useInternationalNumerals bool) (string, error) {
	var model, mode string
	switch {
	case MayuraV1Languages[targetLangCode]:
		model = "mayura:v1"
		mode = "modern-colloquial"
	case SarvamTranslateV1Languages[targetLangCode]:
		model = "sarvam-translate:v1"
		mode = "formal"
	default:
		return "", fmt.Errorf("sarvam translate: unsupported target language %q", targetLangCode)
	}

	req := translateRequest{
		Input:              text,
		SourceLanguageCode: "en-IN",
		TargetLanguageCode: targetLangCode,
		Model:              model,
		Mode:               mode,
	}
	if useInternationalNumerals {
		req.NumeralsFormat = "international"
	}

	body, _ := json.Marshal(req)

	httpReq, err := http.NewRequest(http.MethodPost, translateURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("api-subscription-key", c.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("sarvam translate HTTP: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("sarvam translate %d: %s", resp.StatusCode, string(errBody))
	}

	var result translateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("sarvam translate decode: %w", err)
	}
	if result.TranslatedText == "" {
		return "", fmt.Errorf("sarvam translate: empty translated_text in response")
	}
	return result.TranslatedText, nil
}
