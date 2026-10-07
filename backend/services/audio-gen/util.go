package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
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
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("marshal webhook payload failed: %v", err)
		return
	}
	webhookURL := fmt.Sprintf("%s/webhooks/worker/%s", strings.TrimRight(gatewayURL, "/"), stepName)
	client := &http.Client{Timeout: 15 * time.Second}
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := signedWorkerRequest(webhookURL, body)
		if err == nil {
			var resp *http.Response
			resp, err = client.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 300 {
					return
				}
				err = fmt.Errorf("non-2xx webhook status %d", resp.StatusCode)
			}
		}
		log.Printf("webhook attempt %d failed: %v", attempt, err)
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}
	log.Printf("webhook permanently failed for run=%s step=%s", runID, stepName)
}

func signedWorkerRequest(webhookURL string, body []byte) (*http.Request, error) {
	secret := []byte(os.Getenv("WORKER_WEBHOOK_SECRET"))
	if len(secret) < 32 {
		return nil, fmt.Errorf("WORKER_WEBHOOK_SECRET must contain at least 32 bytes")
	}
	req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return nil, fmt.Errorf("generate webhook nonce: %w", err)
	}
	nonce := hex.EncodeToString(nonceBytes)
	canonical := fmt.Sprintf("POST\n%s\n%s\n%s\n", req.URL.RequestURI(), timestamp, nonce)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(canonical))
	_, _ = mac.Write(body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Saral-Worker-Timestamp", timestamp)
	req.Header.Set("X-Saral-Worker-Nonce", nonce)
	req.Header.Set("X-Saral-Worker-Signature", hex.EncodeToString(mac.Sum(nil)))
	return req, nil
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
