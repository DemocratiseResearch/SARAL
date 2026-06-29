package models

// SSEEvent is pushed to the browser over SSE for every pipeline stage change.
// ID is the pipeline_steps UUID used as the SSE "id:" field for reconnection
// replay. It is intentionally excluded from the JSON payload — the browser
// EventSource API tracks it via the wire-level "id:" line.
// Data carries optional structured metadata (e.g. title/authors after
// metadata_extract, draft content after social draft steps).
type SSEEvent struct {
	ID      string      `json:"-"`
	Step    string      `json:"step"`
	Status  string      `json:"status"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}
