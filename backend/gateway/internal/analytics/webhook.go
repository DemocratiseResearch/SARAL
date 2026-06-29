
package analytics

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

// NotifyDashboard sends a cache-invalidation webhook to the Next.js dashboard.

func NotifyDashboard(userID, email, event string, data map[string]string) {
	webhookURL := os.Getenv("DASHBOARD_WEBHOOK_URL")
	if webhookURL == "" {
		return // silent no-op when not configured
	}

	if data == nil {
		data = map[string]string{}
	}

	type dashboardPayload struct {
		Secret    string            `json:"secret"`
		UserID    string            `json:"user_id"`
		Email     string            `json:"email"`
		Event     string            `json:"event"`
		Timestamp string            `json:"timestamp"`
		Data      map[string]string `json:"data"`
	}
	payload := dashboardPayload{
		Secret:    os.Getenv("DASHBOARD_WEBHOOK_SECRET"),
		UserID:    userID,
		Email:     email,
		Event:     event,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[WEBHOOK] marshal failed (non-blocking): %v", err)
		return
	}

	const maxAttempts = 3
	const perAttemptTimeout = 20 * time.Second

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), perAttemptTimeout)
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
		if reqErr != nil {
			cancel()
			log.Printf("[WEBHOOK] build request failed (non-blocking): %v", reqErr)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, doErr := http.DefaultClient.Do(req)
		cancel()

		if doErr == nil {
			resp.Body.Close()
			if resp.StatusCode < 400 {
				log.Printf("[WEBHOOK] notified dashboard: event=%s user_id=%s status=%d",
					event, userID, resp.StatusCode)
				return
			}
			log.Printf("[WEBHOOK] dashboard returned %d (attempt %d/%d): event=%s user_id=%s",
				resp.StatusCode, attempt, maxAttempts, event, userID)
		} else {
			log.Printf("[WEBHOOK] failed to notify dashboard (attempt %d/%d): %v",
				attempt, maxAttempts, doErr)
		}

		if attempt < maxAttempts {
			// Exponential back-off: 1 s, 2 s (mirrors webhook.py)
			time.Sleep(time.Duration(1<<uint(attempt-1)) * time.Second)
		}
	}

	log.Printf("[WEBHOOK] all %d attempts failed for event=%s user_id=%s. Giving up (non-blocking).",
		maxAttempts, event, userID)
}
