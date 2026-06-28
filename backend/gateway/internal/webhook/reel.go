package webhook

import (
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

func handleReelStep(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	switch update.StepName {
	case "reel_audio_gen":
		reelAudioDone(c, pool, rdb, sseMgr, runID, update)
	case "reel_video_gen":
		reelVideoDone(c, pool, sseMgr, runID, update)
	}
}

func reelAudioDone(c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	run, err := db.GetRun(gctx, pool, runID)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "run not found")
		return
	}
	videoStepID, err := db.CreateStep(gctx, pool, runID, "reel_video_gen")
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
		return
	}
	if err := db.UpdateRunCurrentStep(gctx, pool, runID, "reel_video_gen", "processing"); err != nil {
		log.Printf("UpdateRunCurrentStep error: %v", err)
	}
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		ID:      videoStepID.String(),
		Step:    "reel_video_gen",
		Status:  "processing",
		Message: "Rendering reel video...",
	})
	jobData := redisx.JobData{
		"run_id":            update.RunID,
		"step_id":           videoStepID.String(),
		"paper_id":          run.PaperID.String(),
		"user_id":           run.UserID.String(),
		"mode":              "reel",
		"manifest_gcs_path": update.GCSOutputPath,
	}
	if err := triggerFFmpegDirect(c.Request.Context(), rdb, update.RunID, jobData); err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue reel_video_gen")
		return
	}
	apiresp.OK(c, gin.H{"ok": true})
}

func reelVideoDone(c *gin.Context, pool *pgxpool.Pool, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	if err := db.CompleteRun(gctx, pool, runID); err != nil {
		log.Printf("CompleteRun error: %v", err)
	}
	trackOutputAnalytics(pool, runID, "reel", update.GCSOutputPath)
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step: "pipeline", Status: "completed", Message: "Your reel is ready",
	})
	apiresp.OK(c, gin.H{"ok": true})
}
