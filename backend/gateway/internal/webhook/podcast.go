package webhook

import (
	"context"
	"encoding/json"
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
	"github.com/saral/gateway/internal/storage"
)

func handlePodcastStep(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID, stepID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	switch update.StepName {
	case "podcast_pdf_extract":
		podcastPDFExtractDone(gctx, c, pool, rdb, sseMgr, runID, update)
	case "podcast_script_gen":
		podcastScriptDone(gctx, c, pool, rdb, sseMgr, runID, update)
	case "podcast_tts":
		podcastTTSDone(gctx, c, pool, rdb, sseMgr, runID, update)
	}
}

func podcastPDFExtractDone(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	run, err := db.GetRun(gctx, pool, runID)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "run not found")
		return
	}
	scriptStepID, err := db.CreateStep(gctx, pool, runID, "podcast_script_gen")
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
		return
	}
	if err := db.UpdateRunCurrentStep(gctx, pool, runID, "podcast_script_gen", "processing"); err != nil {
		log.Printf("UpdateRunCurrentStep error: %v", err)
	}
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step:    "podcast_script_gen",
		Status:  "processing",
		Message: "Starting podcast_script_gen",
	})
	jobData := redisx.JobData{
		"run_id":             update.RunID,
		"step_id":            scriptStepID.String(),
		"paper_id":           run.PaperID.String(),
		"user_id":            run.UserID.String(),
		"extracted_gcs_path": update.GCSOutputPath,
		"pipeline_type":      "podcast",
	}
	if _, err := redisx.EnqueueJob(gctx, rdb, redisx.StreamScript, jobData); err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue podcast_script_gen")
		return
	}
	apiresp.OK(c, gin.H{"ok": true})
}

func podcastScriptDone(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	run, err := db.GetRun(gctx, pool, runID)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "run not found")
		return
	}
	if update.PaperTitle != "" {
		if err := db.UpdatePaperMetadata(gctx, pool, run.PaperID, update.PaperTitle, update.PaperAuthors, ""); err != nil {
			log.Printf("UpdatePaperMetadata error: %v", err)
		}
	}
	ttsStepID, err := db.CreateStep(gctx, pool, runID, "podcast_tts")
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
		return
	}
	if err := db.UpdateRunCurrentStep(gctx, pool, runID, "podcast_tts", "processing"); err != nil {
		log.Printf("UpdateRunCurrentStep error: %v", err)
	}
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step:    "podcast_tts",
		Status:  "processing",
		Message: "Converting dialogue to speech...",
	})
	_, sarvamKey, _ := db.GetUserKeys(gctx, pool, run.UserID)
	jobData := redisx.JobData{
		"run_id":          update.RunID,
		"step_id":         ttsStepID.String(),
		"paper_id":        run.PaperID.String(),
		"user_id":         run.UserID.String(),
		"script_gcs_path": update.GCSOutputPath,
		"pipeline_type":   "podcast",
		"sarvam_key":      sarvamKey,
	}
	if _, err := redisx.EnqueueJob(gctx, rdb, redisx.StreamAudio, jobData); err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue podcast_tts")
		return
	}
	apiresp.OK(c, gin.H{"ok": true})
}

func podcastTTSDone(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	scriptPath, err := db.GetStepOutput(gctx, pool, runID, "podcast_script_gen")
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", "podcast script not found")
		return
	}
	scriptBytes, err := storage.DownloadJSON(gctx, scriptPath)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "storage_error", "podcast script not found")
		return
	}
	var podcast models.PodcastScript
	if err := json.Unmarshal(scriptBytes, &podcast); err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "podcast script decode failed")
		return
	}

	renderVideo := true
	if podcast.RenderVideo != nil {
		renderVideo = *podcast.RenderVideo
	}

	if renderVideo {
		run, err := db.GetRun(gctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "run not found")
			return
		}
		jobData := redisx.JobData{
			"mode":           "waveform",
			"audio_gcs_path": update.GCSOutputPath,
			"paper_id":       run.PaperID.String(),
			"user_id":        run.UserID.String(),
		}
		paperTitle, paperAuthors, metaErr := db.GetPaperMetadata(gctx, pool, run.PaperID)
		if metaErr == nil {
			if paperTitle == "" {
				paperTitle = podcast.Title
			}
			jobData["paper_title"] = paperTitle
			jobData["paper_authors"] = paperAuthors
		} else {
			jobData["paper_title"] = podcast.Title
		}
		if err := ffmpegStitchStep(ctx, c, pool, rdb, sseMgr, runID, update.RunID, jobData, "Rendering waveform video..."); err != nil {
			log.Printf("podcast ffmpeg_stitch enqueue error: %v", err)
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue podcast waveform render")
			return
		}
		apiresp.OK(c, gin.H{"ok": true})
		return
	}

	// Audio-only podcast — complete the run now.
	if err := db.CompleteRun(gctx, pool, runID); err != nil {
		log.Printf("CompleteRun error: %v", err)
	}
	go func(rID uuid.UUID, gcsPath string) {
		r, err := db.GetRun(context.Background(), pool, rID)
		if err != nil {
			return
		}
		trackOutputAnalytics(pool, rID, "podcast", gcsPath)
		fbUID, _ := db.GetUserFirebaseUID(context.Background(), pool, r.UserID)
		_ = fbUID
	}(runID, update.GCSOutputPath)
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step: "podcast_tts", Status: "completed", Message: "Podcast generated successfully",
	})
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step: "pipeline", Status: "completed", Message: "Your podcast is ready to download",
	})
	apiresp.OK(c, gin.H{"ok": true})
}
