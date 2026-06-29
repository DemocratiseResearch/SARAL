package pipeline

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)


func RetryRunHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		// ── Auth ──────────────────────────────────────────────────────────────
		var firebaseUID, email, provider string
		if uid := c.GetHeader("X-User-ID"); uid != "" {
			firebaseUID = uid
			email = uid + "@local.dev"
			provider = "local"
		} else {
			firebaseUID = c.MustGet("firebase_uid").(string)
			email = c.GetString("email")
			provider = c.GetString("provider")
		}
		userID, err := db.UpsertUser(ctx, pool, firebaseUID, email, provider)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "user_error", err.Error())
			return
		}

		// ── Verify ownership and state ────────────────────────────────────────
		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}
		if run.UserID != userID {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "run does not belong to this user")
			return
		}
		if run.Status != "failed" {
			apiresp.Error(c, http.StatusBadRequest, "run_not_failed", "only failed runs can be retried")
			return
		}

		// ── Read checkpoint ───────────────────────────────────────────────────
		failedStep, ckData, err := db.GetCheckpoint(ctx, pool, runID)
		if err != nil {
			failedStep = ""
			ckData = map[string]interface{}{}
		}

		// ── API keys ──────────────────────────────────────────────────────────
		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, userID)

		mode, _ := db.GetRunMode(ctx, pool, runID)

		// Reset the run to 'processing' before re-enqueueing.
		if err := db.ResetRunForRetry(ctx, pool, runID); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to reset run: "+err.Error())
			return
		}

		// ckPath returns the GCS path for a checkpoint key IFF the object still
		// exists in GCS.  Returns "" when the path is missing or the object is gone.
		ckPath := func(key string) string {
			v, _ := ckData[key].(string)
			if v != "" && storage.Exists(ctx, v) {
				return v
			}
			return ""
		}

		var resumed bool
		switch mode {
		case "video":
			resumed = retryVideo(ctx, pool, rdb, sseMgr, run, runID, failedStep, ckPath, geminiKey, sarvamKey)
		case "podcast":
			resumed = retryPodcast(ctx, pool, rdb, sseMgr, run, runID, failedStep, ckPath, geminiKey, sarvamKey)
		case "poster":
			resumed = retryPoster(ctx, pool, rdb, sseMgr, run, runID, failedStep, ckPath, geminiKey)
		case "reel":
			resumed = retryReel(ctx, pool, rdb, sseMgr, run, runID, failedStep, ckPath, geminiKey, sarvamKey)
		default:
			// Fallback: mark as failed again — we don't know how to retry this mode.
			_ = db.FailRunWithStep(ctx, pool, runID, failedStep, "unknown pipeline mode: "+mode)
			apiresp.Error(c, http.StatusBadRequest, "unknown_mode", "unknown pipeline mode: "+mode)
			return
		}

		message := "Restarted pipeline from the beginning"
		if resumed {
			message = "Resumed pipeline from checkpoint"
		}
		apiresp.OK(c, gin.H{
			"ok":      true,
			"resumed": resumed,
			"message": message,
		})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func enqueueStep(
	ctx context.Context,
	pool *pgxpool.Pool,
	sseMgr *sse.Manager,
	runID uuid.UUID,
	stepName, message string,
) (uuid.UUID, error) {
	stepID, err := db.CreateStep(ctx, pool, runID, stepName)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create step %s: %w", stepName, err)
	}
	db.UpdateRunCurrentStep(ctx, pool, runID, stepName, "processing")
	sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
		ID:      stepID.String(),
		Step:    stepName,
		Status:  "processing",
		Message: message,
	})
	return stepID, nil
}

// ── Video ─────────────────────────────────────────────────────────────────────

func retryVideo(
	ctx context.Context,
	pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager,
	run *models.Run, runID uuid.UUID,
	failedStep string,
	ckPath func(string) string,
	geminiKey, sarvamKey string,
) bool {
	switch failedStep {
	case "script_gen":
		if extractedPath := ckPath("pdf_extract_path"); extractedPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "script_gen", "Re-generating script...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
				"run_id":             runID.String(),
				"step_id":            stepID.String(),
				"paper_id":           run.PaperID.String(),
				"user_id":            run.UserID.String(),
				"extracted_gcs_path": extractedPath,
				"gemini_key":         geminiKey,
				"sarvam_key":         sarvamKey,
				"is_retry":           "true",
			})
			return true
		}

	case "beamer_compile":
		if scriptPath := ckPath("script_path"); scriptPath != "" {
			extractedPath := ckPath("pdf_extract_path") // best-effort
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "beamer_compile", "Re-compiling slides...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamBeamer, redisx.JobData{
				"run_id":             runID.String(),
				"step_id":            stepID.String(),
				"paper_id":           run.PaperID.String(),
				"user_id":            run.UserID.String(),
				"script_gcs_path":    scriptPath,
				"extracted_gcs_path": extractedPath,
				"is_retry":           "true",
			})
			return true
		}

	case "audio_gen":
		if scriptPath := ckPath("script_path"); scriptPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "audio_gen", "Re-generating audio...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamAudio, redisx.JobData{
				"run_id":          runID.String(),
				"step_id":         stepID.String(),
				"paper_id":        run.PaperID.String(),
				"user_id":         run.UserID.String(),
				"script_gcs_path": scriptPath,
				"sarvam_key":      sarvamKey,
				"is_retry":        "true",
			})
			return true
		}

	case "ffmpeg_stitch":
		beamerPath := ckPath("beamer_path")
		audioPath := ckPath("audio_manifest_path")
		if beamerPath != "" && audioPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "ffmpeg_stitch", "Re-stitching video...")
			if err != nil {
				return false
			}
			TriggerFFmpeg(ctx, rdb, runID.String(), redisx.JobData{
				"step_id":                 stepID.String(),
				"paper_id":                run.PaperID.String(),
				"user_id":                 run.UserID.String(),
				"frames_prefix":           fmt.Sprintf("%s/%s/runs/%s/beamer_compile/frames/", run.UserID, run.PaperID, runID),
				"audio_manifest_gcs_path": audioPath,
				"is_retry":                "true",
			})
			return true
		}
	}

	// Checkpoint stale or step not recognised — full restart from pdf_extract.
	return restartVideoFromScratch(ctx, pool, rdb, sseMgr, run, runID, geminiKey, sarvamKey)
}

func restartVideoFromScratch(
	ctx context.Context,
	pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager,
	run *models.Run, runID uuid.UUID,
	geminiKey, sarvamKey string,
) bool {
	sourcePath, err := db.GetPaperSourcePath(ctx, pool, run.PaperID)
	if err != nil || sourcePath == "" {
		return false
	}
	stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "pdf_extract", "Restarting — extracting PDF...")
	if err != nil {
		return false
	}
	redisx.EnqueueJob(ctx, rdb, redisx.StreamPDF, redisx.JobData{
		"run_id":     runID.String(),
		"step_id":    stepID.String(),
		"paper_id":   run.PaperID.String(),
		"user_id":    run.UserID.String(),
		"gcs_path":   sourcePath,
		"gemini_key": geminiKey,
		"sarvam_key": sarvamKey,
	})
	return false // not a checkpoint resume
}

// ── Podcast ───────────────────────────────────────────────────────────────────

func retryPodcast(
	ctx context.Context,
	pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager,
	run *models.Run, runID uuid.UUID,
	failedStep string,
	ckPath func(string) string,
	geminiKey, sarvamKey string,
) bool {
	switch failedStep {
	case "podcast_script_gen":
		if extractedPath := ckPath("pdf_extract_path"); extractedPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "podcast_script_gen", "Re-generating podcast script...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
				"run_id":             runID.String(),
				"step_id":            stepID.String(),
				"paper_id":           run.PaperID.String(),
				"user_id":            run.UserID.String(),
				"extracted_gcs_path": extractedPath,
				"gemini_key":         geminiKey,
				"sarvam_key":         sarvamKey,
				"mode":               "podcast",
				"is_retry":           "true",
			})
			return true
		}

	case "podcast_tts":
		if scriptPath := ckPath("script_path"); scriptPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "podcast_tts", "Re-generating podcast audio...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamAudio, redisx.JobData{
				"run_id":          runID.String(),
				"step_id":         stepID.String(),
				"paper_id":        run.PaperID.String(),
				"user_id":         run.UserID.String(),
				"script_gcs_path": scriptPath,
				"pipeline_type":   "podcast",
				"sarvam_key":      sarvamKey,
				"is_retry":        "true",
			})
			return true
		}

	case "ffmpeg_stitch":
		if audioPath := ckPath("audio_manifest_path"); audioPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "ffmpeg_stitch", "Re-stitching podcast video...")
			if err != nil {
				return false
			}
			TriggerFFmpeg(ctx, rdb, runID.String(), redisx.JobData{
				"step_id":        stepID.String(),
				"paper_id":       run.PaperID.String(),
				"user_id":        run.UserID.String(),
				"mode":           "waveform",
				"audio_gcs_path": audioPath,
				"is_retry":       "true",
			})
			return true
		}
	}

	// Fallback: restart podcast from its first step (script gen) using any
	// pdf_extract output saved from a previous video run.
	extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, run.PaperID, "pdf_extract")
	if err != nil || extractedPath == "" {
		return false
	}
	stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "podcast_script_gen", "Restarting podcast script generation...")
	if err != nil {
		return false
	}
	redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
		"run_id":             runID.String(),
		"step_id":            stepID.String(),
		"paper_id":           run.PaperID.String(),
		"user_id":            run.UserID.String(),
		"extracted_gcs_path": extractedPath,
		"gemini_key":         geminiKey,
		"sarvam_key":         sarvamKey,
		"mode":               "podcast",
	})
	return false
}

// ── Poster ────────────────────────────────────────────────────────────────────

func retryPoster(
	ctx context.Context,
	pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager,
	run *models.Run, runID uuid.UUID,
	failedStep string,
	ckPath func(string) string,
	geminiKey string,
) bool {
	// poster_compile is the only retry-able step.
	if failedStep == "poster_compile" {
		// Try to find the poster content script that was generated.
		contentPath, dbErr := db.GetStepOutput(ctx, pool, runID, "poster_compile")
		if dbErr != nil || contentPath == "" {
			contentPath = ckPath("poster_path")
		}
		extractedPath := ckPath("pdf_extract_path")
		if extractedPath == "" {
			var err error
			extractedPath, err = db.GetLatestStepOutputForPaper(ctx, pool, run.PaperID, "pdf_extract")
			if err != nil {
				extractedPath = ""
			}
		}
		stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "poster_compile", "Re-compiling poster...")
		if err != nil {
			return false
		}
		redisx.EnqueueJob(ctx, rdb, redisx.StreamPoster, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           run.PaperID.String(),
			"user_id":            run.UserID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"is_retry":           "true",
		})
		return true
	}
	return false
}

// ── Reel ──────────────────────────────────────────────────────────────────────

func retryReel(
	ctx context.Context,
	pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager,
	run *models.Run, runID uuid.UUID,
	failedStep string,
	ckPath func(string) string,
	geminiKey, sarvamKey string,
) bool {
	switch failedStep {
	case "reel_audio_gen":
		if scriptPath := ckPath("script_path"); scriptPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "reel_audio_gen", "Re-generating reel audio...")
			if err != nil {
				return false
			}
			redisx.EnqueueJob(ctx, rdb, redisx.StreamAudio, redisx.JobData{
				"run_id":          runID.String(),
				"step_id":         stepID.String(),
				"paper_id":        run.PaperID.String(),
				"user_id":         run.UserID.String(),
				"script_gcs_path": scriptPath,
				"pipeline_type":   "reel",
				"gemini_key":      geminiKey,
				"sarvam_key":      sarvamKey,
				"is_retry":        "true",
			})
			return true
		}

	case "reel_video_gen":
		if audioPath := ckPath("audio_manifest_path"); audioPath != "" {
			stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "reel_video_gen", "Re-rendering reel video...")
			if err != nil {
				return false
			}
			TriggerFFmpeg(ctx, rdb, runID.String(), redisx.JobData{
				"step_id":           stepID.String(),
				"paper_id":          run.PaperID.String(),
				"user_id":           run.UserID.String(),
				"mode":              "reel",
				"manifest_gcs_path": audioPath,
				"is_retry":          "true",
			})
			return true
		}
	}

	// Fallback: restart from reel_script_gen using existing pdf_extract.
	extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, run.PaperID, "pdf_extract")
	if err != nil || extractedPath == "" {
		return false
	}
	stepID, err := enqueueStep(ctx, pool, sseMgr, runID, "reel_script_gen", "Restarting reel script generation...")
	if err != nil {
		return false
	}
	redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
		"run_id":             runID.String(),
		"step_id":            stepID.String(),
		"paper_id":           run.PaperID.String(),
		"user_id":            run.UserID.String(),
		"extracted_gcs_path": extractedPath,
		"gemini_key":         geminiKey,
		"sarvam_key":         sarvamKey,
		"mode":               "reel",
	})
	return false
}
