package bhashini

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)


type MTModel struct {
	ModelID        string `json:"model_id"`
	ModelType      string `json:"model_type"`
	APIURL         string `json:"api_url"`
	AccessToken    string `json:"access_token"`
	SourceLanguage string `json:"source_language"`
	TargetLanguage string `json:"target_language"` // English display name e.g. "Hindi" (MT only)
}

var bcp47ToTTSDisplayName = map[string]string{
	"as-IN":  "Assamese",
	"brx-IN": "Bodo",
	"doi-IN": "Dogri",
	"kok-IN": "Konkani",
	"mai-IN": "Maithili",
	"mni-IN": "Manipuri",
	"ne-IN":  "Nepali",
	"sa-IN":  "Sanskrit",
	"sat-IN": "Santali",
	"ur-IN":  "Urdu",
}

// bhashiniGenderOverride maps BCP-47 codes to the ONLY gender their TTS model
//	Bodo    (brx-IN) — male returns HTTP 500  → force "female"
//	Dogri   (doi-IN) — female returns HTTP 500 → force "male"
//	Maithili(mai-IN) — female returns HTTP 500 → force "male"
//	Manipuri(mni-IN) — female returns HTTP 500 → force "male"
var bhashiniGenderOverride = map[string]string{
	"brx-IN": "female", // Bodo
	"doi-IN": "male",   // Dogri
	"mai-IN": "male",   // Maithili
	"mni-IN": "male",   // Manipuri
}

// Registry holds the loaded MT and TTS models.
type Registry struct {
	models    map[string]MTModel // key: lowercase target_language (MT)
	ttsModels map[string]MTModel // key: lowercase source_language (TTS)
}

// LoadRegistry reads models.json and returns a Registry.
func LoadRegistry(path string) (*Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read models.json: %w", err)
	}

	var raw []MTModel
	// models.json may have MongoDB extended JSON fields; unmarshal into MTModel ignores extras.
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse models.json: %w", err)
	}

	m := &Registry{
		models:    make(map[string]MTModel),
		ttsModels: make(map[string]MTModel),
	}
	for _, model := range raw {
		switch model.ModelType {
		case "mt":
			key := strings.ToLower(strings.TrimSpace(model.TargetLanguage))
			m.models[key] = model
		case "tts":
			key := strings.ToLower(strings.TrimSpace(model.SourceLanguage))
			m.ttsModels[key] = model
		}
	}
	return m, nil
}

// Translate calls the Bhashini MT API to translate English text to the target language.
// targetDisplayName is the English display name used in models.json (e.g. "Hindi").
func (r *Registry) Translate(text, targetDisplayName string) (string, error) {
	key := strings.ToLower(strings.TrimSpace(targetDisplayName))
	model, ok := r.models[key]
	if !ok {
		return "", fmt.Errorf("bhashini: no MT model for language %q", targetDisplayName)
	}

	payload := map[string]interface{}{
		"input_text": text,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, model.APIURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("access-token", model.AccessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("bhashini MT HTTP: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("bhashini MT %d: %s", resp.StatusCode, string(errBody))
	}

	var result struct {
		Data struct {
			OutputText string `json:"output_text"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("bhashini MT decode: %w", err)
	}
	if result.Data.OutputText == "" {
		return "", fmt.Errorf("bhashini MT: empty output_text")
	}
	return result.Data.OutputText, nil
}


func (r *Registry) SynthesizeTTS(text, langCode, gender string) ([]byte, error) {
	displayName, ok := bcp47ToTTSDisplayName[langCode]
	if !ok {
		return nil, fmt.Errorf("bhashini TTS: unsupported language %q", langCode)
	}

	model, ok := r.ttsModels[strings.ToLower(displayName)]
	if !ok {
		return nil, fmt.Errorf("bhashini TTS: no model loaded for language %q", displayName)
	}

	// Apply per-language gender override: some models only support one gender.
	// (e.g. Bodo=female-only, Dogri=male-only, Manipuri=male-only)
	if forced, ok := bhashiniGenderOverride[langCode]; ok {
		gender = forced
	}

	// API expects {"text": "...", "gender": "male"|"female"}
	payload := map[string]string{"text": text, "gender": gender}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, model.APIURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("access-token", model.AccessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bhashini TTS HTTP: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("bhashini TTS %d: %s", resp.StatusCode, string(errBody))
	}

	// Response: {"data": {"s3_url": "https://..."}}
	var result struct {
		Data struct {
			S3URL string `json:"s3_url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("bhashini TTS decode: %w", err)
	}
	if result.Data.S3URL == "" {
		return nil, fmt.Errorf("bhashini TTS: empty s3_url in response")
	}

	// Download audio from S3 URL
	audioResp, err := http.Get(result.Data.S3URL) //nolint:noctx
	if err != nil {
		return nil, fmt.Errorf("bhashini TTS S3 download: %w", err)
	}
	defer audioResp.Body.Close()
	if audioResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bhashini TTS S3 %d", audioResp.StatusCode)
	}
	audioBytes, err := io.ReadAll(audioResp.Body)
	if err != nil {
		return nil, fmt.Errorf("bhashini TTS S3 read: %w", err)
	}
	return audioBytes, nil
}
