package models

import (
	"time"

	"github.com/google/uuid"
)

// BusinessBriefSections is the fixed 8-key map produced by Gemini.
var BusinessBriefSections = []string{
	"Executive Summary",
	"Business Problem Addressed",
	"Technical Innovation Summary",
	"Business Impact",
	"Commercial Applications",
	"Implementation Considerations",
	"Risks and Limitations",
	"Strategic Recommendations",
}

// BusinessBrief is the full row state surfaced over the API.
type BusinessBrief struct {
	ID           uuid.UUID         `json:"id"`
	PaperID      uuid.UUID         `json:"paper_id"`
	UserID       uuid.UUID         `json:"user_id"`
	Status       string            `json:"status"`
	Sections     map[string]string `json:"sections"`
	ModelVersion string            `json:"model_version"`
	JSONGCSPath  string            `json:"json_gcs_path,omitempty"`
	PDFGCSPath   string            `json:"pdf_gcs_path,omitempty"`
	ErrorMessage string            `json:"error_message,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

// BusinessBriefUpdateRequest is the body for user edits to the sections.
type BusinessBriefUpdateRequest struct {
	Sections map[string]string `json:"sections" binding:"required"`
}

// BusinessBriefGenerateRequest is the optional body for triggering a new brief.
// ModelVersion picks the generator: "v1" = legacy flash, "v2" = grounded pro.
// When omitted the worker falls back to the BUSINESS_BRIEF_V2 env flag.
type BusinessBriefGenerateRequest struct {
	ModelVersion string `json:"model_version"` // "v1" | "v2" | ""
}

// BusinessBriefWebhookPayload is what the Python worker POSTs to
// /webhooks/business-brief/:brief_id when a job finishes.

type BusinessBriefWebhookPayload struct {
	Status       string            `json:"status"` // "completed" | "failed"
	Sections     map[string]string `json:"sections,omitempty"`
	ModelVersion string            `json:"model_version,omitempty"`
	JSONGCSPath  string            `json:"json_gcs_path,omitempty"`
	PDFGCSPath   string            `json:"pdf_gcs_path,omitempty"`
	ErrorMessage string            `json:"error_message,omitempty"`
}