package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// RunMetadataExtract extracts title, authors, and date from a paper and uploads
// a small metadata.json to GCS. The gateway persists these fields in the DB
// and waits for the user to click "Generate Video" before kicking off script_gen.
func RunMetadataExtract(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, extractedPath, userID, paperID string,
) error {
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}

	log.Printf("[metadata-extract][%s] extracting metadata", runID)
	meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
	if err != nil {
		return fmt.Errorf("extract metadata: %w", err)
	}

	payload := map[string]string{
		"title":   meta.Title,
		"authors": meta.Authors,
		"date":    meta.Date,
	}
	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/metadata_extract/metadata.json", userID, paperID, runUUID)
	metaBytes, _ := json.Marshal(payload)
	gcsPath, err := deps.Store.Upload(ctx, metaBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload metadata: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "metadata_extract", "completed", gcsPath, "", meta.Title, meta.Authors, meta.Date)
	log.Printf("[metadata-extract][%s] completed: title=%q authors=%q", runID, meta.Title, meta.Authors)
	return nil
}
