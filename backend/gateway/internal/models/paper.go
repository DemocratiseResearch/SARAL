package models

import (
	"time"

	"github.com/google/uuid"
)

type Paper struct {
	ID            uuid.UUID `json:"id"`
	UserID        uuid.UUID `json:"user_id"`
	GCSSourcePath string    `json:"gcs_source_path"`
	Title         string    `json:"title,omitempty"`
	Authors       string    `json:"authors,omitempty"`
	Date          string    `json:"date,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}
