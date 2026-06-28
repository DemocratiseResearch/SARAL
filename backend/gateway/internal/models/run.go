package models

import (
	"time"

	"github.com/google/uuid"
)

type Run struct {
	ID            uuid.UUID    `json:"id"`
	PaperID       uuid.UUID    `json:"paper_id"`
	UserID        uuid.UUID    `json:"user_id"`
	Status        string       `json:"status"`
	CurrentStep   string       `json:"current_step"`
	ErrorMsg      string       `json:"error_message"`
	AudienceLevel string       `json:"audience_level,omitempty"`
	Tone          string       `json:"tone,omitempty"`
	StartedAt     time.Time    `json:"started_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
	CompletedAt   *time.Time   `json:"completed_at,omitempty"`
	Steps         []StepStatus `json:"steps,omitempty"`
}

type StepStatus struct {
	Name      string     `json:"name"`
	Status    string     `json:"status"` // pending, processing, completed, failed
	ErrorMsg  string     `json:"error_message,omitempty"`
	StartedAt *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type Artifact struct {
	ID           uuid.UUID `json:"id"`
	ArtifactType string    `json:"artifact_type"`
	GCSPath      string    `json:"gcs_path"`
}
