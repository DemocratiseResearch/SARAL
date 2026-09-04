package pipeline

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/saral/gateway/internal/models"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestPaperChatHandler_InvalidPaperID(t *testing.T) {
	r := gin.New()
	r.POST("/paper/:paper_id/chat", PaperChatHandler(nil, nil))

	w := httptest.NewRecorder()
	body, _ := json.Marshal(models.ChatRequest{Message: "What is this paper about?"})
	req, _ := http.NewRequest(http.MethodPost, "/paper/not-a-valid-uuid/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid paper UUID, got %d (body: %s)", w.Code, w.Body.String())
	}
}

func TestPaperChatHandler_Unauthenticated(t *testing.T) {
	r := gin.New()
	r.POST("/paper/:paper_id/chat", PaperChatHandler(nil, nil))

	w := httptest.NewRecorder()
	body, _ := json.Marshal(models.ChatRequest{Message: "What is this paper about?"})
	req, _ := http.NewRequest(http.MethodPost, "/paper/11111111-1111-1111-1111-111111111111/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 when no auth header or context is present, got %d (body: %s)", w.Code, w.Body.String())
	}
}

func TestPaperChatSessionsHandler_InvalidPaperID(t *testing.T) {
	r := gin.New()
	r.GET("/paper/:paper_id/chat/sessions", PaperChatSessionsHandler(nil))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/paper/invalid-uuid/chat/sessions", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid paper UUID in sessions list, got %d", w.Code)
	}
}

func TestPaperChatMessagesHandler_InvalidIDs(t *testing.T) {
	r := gin.New()
	r.GET("/paper/:paper_id/chat/sessions/:session_id/messages", PaperChatMessagesHandler(nil))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/paper/11111111-1111-1111-1111-111111111111/chat/sessions/not-a-uuid/messages", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid session UUID, got %d", w.Code)
	}
}
