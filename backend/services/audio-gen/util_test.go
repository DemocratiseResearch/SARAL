package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestSignedWorkerRequestMatchesGatewayFormat(t *testing.T) {
	secret := strings.Repeat("a", 32)
	t.Setenv("WORKER_WEBHOOK_SECRET", secret)
	body := []byte(`{"run_id":"run-1"}`)
	req, err := signedWorkerRequest("http://gateway/webhooks/worker/audio_gen", body)
	if err != nil {
		t.Fatalf("signedWorkerRequest: %v", err)
	}
	ts := req.Header.Get("X-Saral-Worker-Timestamp")
	nonce := req.Header.Get("X-Saral-Worker-Nonce")
	canonical := "POST\n/webhooks/worker/audio_gen\n" + ts + "\n" + nonce + "\n"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(canonical))
	_, _ = mac.Write(body)
	if got, want := req.Header.Get("X-Saral-Worker-Signature"), hex.EncodeToString(mac.Sum(nil)); got != want {
		t.Fatalf("signature mismatch: got %s want %s", got, want)
	}
}
