package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type memoryReplayGuard struct {
	mu   sync.Mutex
	seen map[string]bool
}

type failingReplayGuard struct{}

func (failingReplayGuard) Claim(context.Context, string, time.Duration) (bool, error) {
	return false, fmt.Errorf("replay store unavailable")
}

func (m *memoryReplayGuard) Claim(_ context.Context, key string, _ time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.seen == nil {
		m.seen = make(map[string]bool)
	}
	if m.seen[key] {
		return false, nil
	}
	m.seen[key] = true
	return true, nil
}

func makeSignedWebhookRequest(t *testing.T, secret []byte, method, path, body, timestamp, nonce string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	canonical := fmt.Sprintf("%s\n%s\n%s\n%s\n%s", method, path, timestamp, nonce, body)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(canonical))
	req.Header.Set(WorkerTimestampHeader, timestamp)
	req.Header.Set(WorkerNonceHeader, nonce)
	req.Header.Set(WorkerSignatureHeader, hex.EncodeToString(mac.Sum(nil)))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func testWebhookRouter(secret []byte, replay ReplayGuard) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/webhooks/worker/:service", SignatureMiddleware(secret, replay), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	return r
}

func TestSignatureMiddlewareRejectsUnsignedRequest(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	r := testWebhookRouter(secret, &memoryReplayGuard{})
	req := httptest.NewRequest(http.MethodPost, "/webhooks/worker/pdf_extract", strings.NewReader(`{}`))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestSignatureMiddlewareAcceptsSignedRequestAndRejectsReplay(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	replay := &memoryReplayGuard{}
	r := testWebhookRouter(secret, replay)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := strings.Repeat("a", 32)

	for i, want := range []int{http.StatusNoContent, http.StatusConflict} {
		req := makeSignedWebhookRequest(t, secret, http.MethodPost, "/webhooks/worker/pdf_extract", `{"ok":true}`, ts, nonce)
		res := httptest.NewRecorder()
		r.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("request %d status = %d, want %d (body %s)", i+1, res.Code, want, res.Body.String())
		}
	}
}

func TestSignatureMiddlewareRejectsTamperedBody(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	r := testWebhookRouter(secret, &memoryReplayGuard{})
	req := makeSignedWebhookRequest(t, secret, http.MethodPost, "/webhooks/worker/pdf_extract", `{"ok":true}`, strconv.FormatInt(time.Now().Unix(), 10), strings.Repeat("b", 32))
	req.Body = io.NopCloser(strings.NewReader(`{"ok":false}`))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestSignatureMiddlewareBindsRequestTarget(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	r := testWebhookRouter(secret, &memoryReplayGuard{})
	req := makeSignedWebhookRequest(t, secret, http.MethodPost, "/webhooks/worker/pdf_extract", `{}`, strconv.FormatInt(time.Now().Unix(), 10), strings.Repeat("d", 32))
	req.URL.Path = "/webhooks/worker/script_gen"
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestSignatureMiddlewareRejectsExpiredTimestamp(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	r := testWebhookRouter(secret, &memoryReplayGuard{})
	ts := strconv.FormatInt(time.Now().Add(-workerMaxAge-time.Minute).Unix(), 10)
	req := makeSignedWebhookRequest(t, secret, http.MethodPost, "/webhooks/worker/pdf_extract", `{}`, ts, strings.Repeat("c", 32))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestSignatureMiddlewareRequiresStrongSecretAndReplayStore(t *testing.T) {
	r := testWebhookRouter([]byte("short"), &memoryReplayGuard{})
	req := httptest.NewRequest(http.MethodPost, "/webhooks/worker/pdf_extract", strings.NewReader(`{}`))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusServiceUnavailable)
	}
}

func TestSignatureMiddlewareFailsClosedWhenReplayStoreUnavailable(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	r := testWebhookRouter(secret, failingReplayGuard{})
	req := makeSignedWebhookRequest(t, secret, http.MethodPost, "/webhooks/worker/pdf_extract", `{}`, strconv.FormatInt(time.Now().Unix(), 10), strings.Repeat("e", 32))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusServiceUnavailable)
	}
}
