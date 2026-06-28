package webhook

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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
		RunID:        runID,
		StepID:       stepID,
		StepName:     stepName,
		Status:       status,
		GCSOutputPath: gcsPath,
		ErrorMessage: errMsg,
		PaperTitle:   paperTitle,
		PaperAuthors: paperAuthors,
		PaperDate:    paperDate,
	}
	url := fmt.Sprintf("%s/webhooks/worker/%s", gatewayURL, stepName)
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
	url := fmt.Sprintf("%s/webhooks/worker/business_brief_script", gatewayURL)
	post(url, payload)
}

// post marshals payload to JSON and POSTs it to url with up to 3 retries.
func post(url string, payload WorkerUpdate) {
	body, _ := json.Marshal(payload)
	for attempt := 1; attempt <= 3; attempt++ {
		resp, err := http.Post(url, "application/json", bytes.NewReader(body))
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 300 {
				return
			}
			log.Printf("webhook attempt %d: non-2xx status %d from %s", attempt, resp.StatusCode, url)
		} else {
			log.Printf("webhook attempt %d: %v", attempt, err)
		}
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}
	log.Printf("webhook permanently failed: url=%s step=%s", url, payload.StepName)
}
