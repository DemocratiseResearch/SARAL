package webhook

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/pipeline"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
)

var zeroTime = time.Time{}

func checkpointKeyForStep(stepName string) string {
	switch stepName {
	case "pdf_extract", "podcast_pdf_extract":
		return "pdf_extract_path"
	case "script_gen", "podcast_script_gen", "reel_script_gen":
		return "script_path"
	case "beamer_compile":
		return "beamer_path"
	case "audio_gen", "podcast_tts", "reel_audio_gen":
		return "audio_manifest_path"
	case "poster_compile":
		return "poster_path"
	default:
		return ""
	}
}


func enqueueNextStep(
	ctx context.Context,
	pool *pgxpool.Pool,
	rdb *goredis.Client,
	sseMgr *sse.Manager,
	runID uuid.UUID,
	runIDStr string,
	nextStep string,
	jobData redisx.JobData,
) error {
	nextStepID, err := db.CreateStep(ctx, pool, runID, nextStep)
	if err != nil {
		return err
	}
	if err := db.UpdateRunCurrentStep(ctx, pool, runID, nextStep, "processing"); err != nil {
		log.Printf("UpdateRunCurrentStep error: %v", err)
	}
	sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
		ID:      nextStepID.String(),
		Step:    nextStep,
		Status:  "processing",
		Message: "Starting " + nextStep,
	})

	jobData["run_id"] = runIDStr
	jobData["step_id"] = nextStepID.String()

	switch nextStep {
	case "script_gen":
		// Re-stamp audience_level/tone from the run so retries preserve the user's choice.
		if run, err := db.GetRun(ctx, pool, runID); err == nil {
			if _, ok := jobData["audience_level"]; !ok && run.AudienceLevel != "" {
				jobData["audience_level"] = run.AudienceLevel
			}
			if _, ok := jobData["tone"]; !ok && run.Tone != "" {
				jobData["tone"] = run.Tone
			}
		}
		_, err = redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, jobData)
		return err
	case "metadata_extract":
		jobData["mode"] = "metadata_extract"
		_, err = redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, jobData)
		return err
	default:
		log.Printf("enqueueNextStep: unknown step %q", nextStep)
		return nil
	}
}


func trackStepAnalytics(pool *pgxpool.Pool, runID uuid.UUID, stepName, gcsPath string) {
	go func() {
		r, err := db.GetRun(context.Background(), pool, runID)
		if err != nil {
			return
		}
		var meta map[string]interface{}
		if gcsPath != "" {
			meta = map[string]interface{}{"gcs_path": gcsPath}
		}
		analytics.TrackPipelineStepComplete(context.Background(), runID.String(), r.PaperID.String(), stepName, zeroTime, meta)
	}()
}


func trackOutputAnalytics(pool *pgxpool.Pool, runID uuid.UUID, outputType, gcsPath string) {
	go func() {
		r, err := db.GetRun(context.Background(), pool, runID)
		if err != nil {
			return
		}
		analytics.TrackOutputGeneration(context.Background(), r.PaperID.String(), r.UserID.String(), outputType, gcsPath, 0, 0)
		fbUID, _ := db.GetUserFirebaseUID(context.Background(), pool, r.UserID)
		analytics.NotifyDashboard(fbUID, "", outputType+"_generated",
			map[string]string{"paper_id": r.PaperID.String()})
	}()
}


func triggerFFmpegDirect(ctx context.Context, rdb *goredis.Client, runID string, jobData redisx.JobData) error {
	return pipeline.TriggerFFmpeg(ctx, rdb, runID, jobData)
}
