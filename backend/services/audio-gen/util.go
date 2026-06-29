package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── GCS ───────────────────────────────────────────────────────────────────────

func downloadGCS(ctx context.Context, gcsPath string) ([]byte, error) {
	key := extractKey(gcsPath)
	rc, err := storageClient.Bucket(bucketName).Object(key).NewReader(ctx)
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func uploadGCS(ctx context.Context, data []byte, objectKey, contentType string) (string, error) {
	wc := storageClient.Bucket(bucketName).Object(objectKey).NewWriter(ctx)
	wc.ContentType = contentType
	if _, err := io.Copy(wc, bytes.NewReader(data)); err != nil {
		_ = wc.Close()
		return "", err
	}
	if err := wc.Close(); err != nil {
		return "", err
	}
	return "gs://" + bucketName + "/" + objectKey, nil
}

func extractKey(gcsPath string) string {
	if strings.HasPrefix(gcsPath, "gs://") {
		parts := strings.SplitN(gcsPath[5:], "/", 2)
		if len(parts) == 2 {
			return parts[1]
		}
	}
	return gcsPath
}

// ── Webhook ───────────────────────────────────────────────────────────────────

func sendWebhook(runID, stepID, status, gcsPath, errMsg, stepName string) {
	if stepName == "" {
		stepName = "audio_gen"
	}
	payload := WorkerUpdate{
		RunID:         runID,
		StepID:        stepID,
		StepName:      stepName,
		Status:        status,
		GCSOutputPath: gcsPath,
		ErrorMessage:  errMsg,
		NextStep:      "",
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/webhooks/worker/%s", gatewayURL, stepName)
	for attempt := 1; attempt <= 3; attempt++ {
		resp, err := http.Post(url, "application/json", bytes.NewReader(body))
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 300 {
				return
			}
		}
		log.Printf("webhook attempt %d failed: %v", attempt, err)
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}
	log.Printf("webhook permanently failed for run=%s step=%s", runID, stepName)
}

// ── Language normalisation ────────────────────────────────────────────────────

// normalizeLang coerces a frontend display name (e.g. "manipuri") or an
// already-BCP-47 code (e.g. "mni-IN") to the canonical BCP-47 form that
// Sarvam/Bhashini expect. Unknown values fall back to "en-IN".
func normalizeLang(value string) string {
	if value == "" {
		return "en-IN"
	}
	v := strings.TrimSpace(value)
	if strings.Contains(v, "-") && len(v) >= 4 {
		parts := strings.SplitN(v, "-", 2)
		return strings.ToLower(parts[0]) + "-" + strings.ToUpper(parts[1])
	}
	displayToBCP47 := map[string]string{
		"english":               "en-IN",
		"hindi":                 "hi-IN",
		"bengali":               "bn-IN",
		"gujarati":              "gu-IN",
		"kannada":               "kn-IN",
		"malayalam":             "ml-IN",
		"marathi":               "mr-IN",
		"odia":                  "od-IN",
		"punjabi":               "pa-IN",
		"tamil":                 "ta-IN",
		"telugu":                "te-IN",
		"assamese":              "as-IN",
		"bodo":                  "brx-IN",
		"dogri":                 "doi-IN",
		"konkani":               "kok-IN",
		"maithili":              "mai-IN",
		"nepali":                "ne-IN",
		"manipuri":              "mni-IN",
		"sanskrit":              "sa-IN",
		"santali":               "sat-IN",
		"urdu":                  "ur-IN",
		"pt":                    "pt-BR",
		"portuguese":            "pt-BR",
		"portugese":             "pt-BR",
		"brazilian portuguese":  "pt-BR",
		"portuguese (brazil)":   "pt-BR",
		"portuguese brazil":     "pt-BR",
		"portuguese (portugal)": "pt-PT",
		"portuguese portugal":   "pt-PT",
	}
	if bcp, ok := displayToBCP47[strings.ToLower(v)]; ok {
		return bcp
	}
	return "en-IN"
}

func normalizePodcastSpeaker(s string) string {
	normalized := strings.ToLower(strings.TrimSpace(s))
	normalized = strings.NewReplacer(" ", "", "-", "", "_", "").Replace(normalized)
	switch normalized {
	case "hosta", "speakera", "a", "aisha":
		return "host_a"
	case "hostb", "speakerb", "b", "rohan":
		return "host_b"
	default:
		return "host_a"
	}
}

func normalizePodcastGender(s, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "male", "m":
		return "male"
	case "female", "f":
		return "female"
	case "":
		return fallback
	default:
		return fallback
	}
}

// ── Misc ─────────────────────────────────────────────────────────────────────

func fieldStr(values map[string]interface{}, key string) string {
	if v, ok := values[key]; ok {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

