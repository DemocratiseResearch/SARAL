package webhook

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// WorkerUpdate is the payload sent to the gateway after each pipeline step.
type WorkerUpdate struct {
	RunID         string `json:"run_id"`
	StepID        string `json:"step_id"`
	StepName      string `json:"step_name"`
	Status        string `json:"status"`
	GCSOutputPath string `json:"gcs_output_path,omitempty"`
	ErrorMessage  string `json:"error_message,omitempty"`
	NextStep      string `json:"next_step"`
	PaperTitle    string `json:"paper_title,omitempty"`
	PaperAuthors  string `json:"paper_authors,omitempty"`
	PaperDate     string `json:"paper_date,omitempty"`
	BriefID       string `json:"brief_id,omitempty"`
	ModelVersion  string `json:"model_version,omitempty"`
}

// Send posts a WorkerUpdate to the gateway for the given pipeline step.
func Send(gatewayURL, runID, stepID, stepName, status, gcsPath, errMsg, paperTitle, paperAuthors, paperDate string) {
	payload := WorkerUpdate{
		RunID:         runID,
		StepID:        stepID,
		StepName:      stepName,
		Status:        status,
		GCSOutputPath: gcsPath,
		ErrorMessage:  errMsg,
		PaperTitle:    paperTitle,
		PaperAuthors:  paperAuthors,
		PaperDate:     paperDate,
	}
	url := fmt.Sprintf("%s/webhooks/worker/%s", strings.TrimRight(gatewayURL, "/"), stepName)
	post(url, payload)
}

// SendBusinessBrief posts the business_brief_script result to the gateway.
func SendBusinessBrief(gatewayURL, briefID, status, sectionsGCSPath, paperTitle, errMsg string) {
	payload := WorkerUpdate{
		StepName:      "business_brief_script",
		Status:        status,
		GCSOutputPath: sectionsGCSPath,
		ErrorMessage:  errMsg,
		BriefID:       briefID,
		PaperTitle:    paperTitle,
		ModelVersion:  "v2",
	}
	url := fmt.Sprintf("%s/webhooks/worker/business_brief_script", strings.TrimRight(gatewayURL, "/"))
	post(url, payload)
}

// post marshals payload to JSON and POSTs it to url with up to 3 retries.
func post(url string, payload WorkerUpdate) {
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("marshal webhook payload failed: %v", err)
		return
	}
	client := &http.Client{Timeout: 15 * time.Second}
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := signedWorkerRequest(url, body)
		if err == nil {
			var resp *http.Response
			resp, err = client.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 300 {
					return
				}
				log.Printf("webhook attempt %d: non-2xx status %d from %s", attempt, resp.StatusCode, url)
			}
		}
		if err != nil {
			log.Printf("webhook attempt %d: %v", attempt, err)
		}
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}
	log.Printf("webhook permanently failed: url=%s step=%s", url, payload.StepName)
}

func signedWorkerRequest(url string, body []byte) (*http.Request, error) {
	secret := []byte(os.Getenv("WORKER_WEBHOOK_SECRET"))
	if len(secret) < 32 {
		return nil, fmt.Errorf("WORKER_WEBHOOK_SECRET must contain at least 32 bytes")
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
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
