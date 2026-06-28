package apiresp

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Envelope is the standard JSON response shape for gateway routes.
// SSE and binary/file-style responses are intentionally excluded.
type Envelope struct {
	Success bool      `json:"success"`
	Data    any       `json:"data,omitempty"`
	Error   *APIError `json:"error,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func JSON(c *gin.Context, status int, data any) {
	c.JSON(status, Envelope{
		Success: true,
		Data:    data,
	})
}

func OK(c *gin.Context, data any) {
	JSON(c, http.StatusOK, data)
}

func Accepted(c *gin.Context, data any) {
	JSON(c, http.StatusAccepted, data)
}

func Error(c *gin.Context, status int, code, message string) {
	if status >= 500 {
		log.Printf("[ERROR] %s %s → %d %s: %s", c.Request.Method, c.Request.URL.Path, status, code, message)
	}
	c.JSON(status, Envelope{
		Success: false,
		Error: &APIError{
			Code:    code,
			Message: message,
		},
	})
}

func AbortError(c *gin.Context, status int, code, message string) {
	Error(c, status, code, message)
	c.Abort()
}
