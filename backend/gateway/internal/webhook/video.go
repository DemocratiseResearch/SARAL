package webhook

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/contracts"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
)

func handleVideoParallelStep(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID, stepID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()

	// slides pipeline: beamer_compile is terminal — no audio or ffmpeg needed.
	if update.StepName == "beamer_compile" {
		runMode, err := db.GetRunMode(gctx, pool, runID)
		if err == nil && runMode == "slides" {
			if err := db.CompleteRun(gctx, pool, runID); err != nil {
				log.Printf("CompleteRun error (slides): %v", err)
			}
			trackOutputAnalytics(pool, runID, "slides", update.GCSOutputPath)
			var pipelineData interface{}
			if update.CompileVersion > 0 {
				pipelineData = map[string]interface{}{"compile_version": update.CompileVersion}
			}
			sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
				Step: "pipeline", Status: "completed",
				Message: "Your slides are ready", Data: pipelineData,
			})
			apiresp.OK(c, gin.H{"ok": true})
			return
		}
	}

	// Video pipeline: wait for both beamer_compile + audio_gen before firing ffmpeg.
	count, err := db.CountCompletedSteps(gctx, pool, runID, []string{"beamer_compile", "audio_gen"})
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "could not check parallel steps")
		return
	}
	if count < 2 {
		apiresp.OK(c, gin.H{"ok": true})
		return
	}

	// Idempotency: don't enqueue a second ffmpeg_stitch if one is already in flight.
	if hasInflight, err := db.HasInflightStep(gctx, pool, runID, "ffmpeg_stitch"); err != nil {
		log.Printf("HasInflightStep error (non-fatal): %v", err)
	} else if hasInflight {
		log.Printf("ffmpeg_stitch already in flight for run %s — skipping", runID)
		apiresp.OK(c, gin.H{"ok": true})
		return
	}

	run, err := db.GetRun(gctx, pool, runID)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "run not found")
		return
	}
	jobData := redisx.JobData{
		"paper_id":                run.PaperID.String(),
		"user_id":                 run.UserID.String(),
		"frames_prefix":           fmt.Sprintf("%s/%s/runs/%s/beamer_compile/frames/", run.UserID, run.PaperID, update.RunID),
		"audio_manifest_gcs_path": fmt.Sprintf("%s/%s/runs/%s/audio_gen/audio_manifest.json", run.UserID, run.PaperID, update.RunID),
	}
	if err := ffmpegStitchStep(ctx, c, pool, rdb, sseMgr, runID, update.RunID, jobData, "Starting ffmpeg_stitch"); err != nil {
		log.Printf("ffmpeg_stitch enqueue error: %v", err)
		apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue ffmpeg_stitch job")
		return
	}
	apiresp.OK(c, gin.H{"ok": true})
}
