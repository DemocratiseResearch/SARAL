package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestSignedWorkerRequestMatchesGatewayFormat(t *testing.T) {
	secret := strings.Repeat("s", 32)
	t.Setenv("WORKER_WEBHOOK_SECRET", secret)
	body := []byte(`{"run_id":"run-1"}`)
	req, err := signedWorkerRequest("http://gateway/webhooks/worker/pdf_extract", body)
	if err != nil {
		t.Fatalf("signedWorkerRequest: %v", err)
	}
	ts := req.Header.Get("X-Saral-Worker-Timestamp")
	nonce := req.Header.Get("X-Saral-Worker-Nonce")
	sig := req.Header.Get("X-Saral-Worker-Signature")
	canonical := "POST\n/webhooks/worker/pdf_extract\n" + ts + "\n" + nonce + "\n"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(canonical))
	_, _ = mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	if sig != want {
		t.Fatalf("signature mismatch: got %s want %s", sig, want)
	}
	if got := req.Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
}

func TestSignedWorkerRequestRejectsShortSecret(t *testing.T) {
	t.Setenv("WORKER_WEBHOOK_SECRET", "short")
	if _, err := signedWorkerRequest("http://gateway/webhooks/worker/pdf_extract", []byte(`{}`)); err == nil {
		t.Fatal("expected short secret to be rejected")
	}
}
