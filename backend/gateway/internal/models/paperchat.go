package models

import (
	"time"

	"github.com/google/uuid"
)

// ChatSession represents a conversation thread for a given paper and user.
type ChatSession struct {
	ID        uuid.UUID `json:"id"`
	PaperID   uuid.UUID `json:"paper_id"`
	UserID    uuid.UUID `json:"user_id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChatMessage represents a single turn in a paper chat session.
type ChatMessage struct {
	ID        uuid.UUID `json:"id"`
	SessionID uuid.UUID `json:"session_id"`
	Role      string    `json:"role"` // "user" | "assistant"
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// ChatRequest is the incoming payload for POST /paper/:paper_id/chat.
type ChatRequest struct {
	Message   string     `json:"message" binding:"required"`
	SessionID *uuid.UUID `json:"session_id,omitempty"`
}

// ChatResponse is returned by POST /paper/:paper_id/chat.
type ChatResponse struct {
	SessionID uuid.UUID   `json:"session_id"`
	Message   ChatMessage `json:"message"`
}
