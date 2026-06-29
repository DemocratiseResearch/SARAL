

package analytics

import (
	"context"
	"fmt"
	"time"
)

// TrackPaperUpload records a newly uploaded paper in paper_metadata and bumps

func TrackPaperUpload(
	ctx context.Context,
	runID, paperID, userID, userEmail, sourceType, filename, title string,
) {
	data := map[string]interface{}{
		"paper_id": paperID,
		"source": map[string]interface{}{
			"type":     orDefault(sourceType, "pdf"),
			"filename": orDefault(filename, "unknown"),
		},
		"status":              "uploaded",
		"processing_outputs": map[string]interface{}{},
	}
	if userID != "" {
		data["user_id"] = userID
		if userEmail != "" {
			data["user_email"] = userEmail
		}
	}
	if title != "" {
		data["title"] = title
	}

	SavePaperMetadata(ctx, paperID, data)
	InitPipelineTracking(ctx, runID, paperID, userID, "video")

	if userID != "" {
		IncrementUserCounter(ctx, userID, "total_papers", 1)
		UpdateUserActivity(ctx, userID, map[string]interface{}{
			"email": userEmail,
		})
	}
}

// TrackOutputGeneration records a generated artifact (video, podcast, reel,

func TrackOutputGeneration(
	ctx context.Context,
	paperID, userID, outputType, gcsPath string,
	sizeBytes int64,
	duration float64,
) {
	outData := map[string]interface{}{
		"generated": true,
	}
	if gcsPath != "" {
		outData["path"] = gcsPath
	}
	if sizeBytes > 0 {
		outData["size_bytes"] = sizeBytes
	}
	if duration > 0 {
		outData["duration_seconds"] = duration
	}

	UpdatePaperOutput(ctx, paperID, outputType, outData)

	if userID != "" {
		counterName := counterForOutputType(outputType)
		IncrementUserCounter(ctx, userID, counterName, 1)
	}
}

// TrackPaperTitle updates the title field in paper_metadata.

func TrackPaperTitle(ctx context.Context, paperID, title string) {
	if title == "" {
		return
	}
	SavePaperMetadata(ctx, paperID, map[string]interface{}{"title": title})
}

// TrackLoginSuccess increments the total_logins counter for a user.
func TrackLoginSuccess(ctx context.Context, userID, email string) {
	if userID == "" {
		return
	}
	IncrementUserCounter(ctx, userID, "total_logins", 1)
	UpdateUserActivity(ctx, userID, map[string]interface{}{"email": email})
}

// TrackPipelineStepStart records a stage as "in_progress" in the pipeline run document.
func TrackPipelineStepStart(ctx context.Context, runID, paperID, step string) time.Time {
	now := time.Now()
	UpdatePipelineStep(ctx, runID, paperID, step, map[string]interface{}{
		"started_at": now,
	}, nil, "in_progress")
	return now
}

// TrackPipelineStepComplete records a stage as "completed".
func TrackPipelineStepComplete(ctx context.Context, runID, paperID, step string, startedAt time.Time, metadata map[string]interface{}) {
	UpdatePipelineStep(ctx, runID, paperID, step, metadata, &startedAt, "completed")
}

// TrackPipelineStepFailed records a stage failure with classified error code.
func TrackPipelineStepFailed(ctx context.Context, runID, paperID, step string, errMsg string, startedAt *time.Time) {
	errCode := ClassifyError(errMsg)
	MarkPipelineFailed(ctx, runID, paperID, step, errMsg, errCode, startedAt)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func counterForOutputType(outputType string) string {
	// Match Python logic: total_reels (already plural), total_videos, etc.
	switch outputType {
	case "reels":
		return "total_reels"
	case "slides":
		return "total_slides"
	case "business_brief":
		return "total_business_briefs"
	default:
		return fmt.Sprintf("total_%ss", outputType) // video→total_videos, podcast→total_podcasts
	}
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
