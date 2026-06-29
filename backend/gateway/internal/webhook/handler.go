package webhook

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/contracts"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/pipeline"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
)

func Handler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var update contracts.WorkerUpdate
		if err := c.ShouldBindJSON(&update); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_webhook_payload", err.Error())
			return
		}
		serviceName := c.Param("service")
		if serviceName != "" && update.StepName != "" && serviceName != update.StepName {
			apiresp.Error(c, http.StatusBadRequest, "service_step_mismatch", "webhook route does not match step_name")
			return
		}

		ctx := c.Request.Context()

		// ── Business brief (no run_id / step_id) ─────────────────────────────
		if update.StepName == "business_brief" || update.StepName == "business_brief_script" {
			handleBriefWebhook(ctx, c, pool, rdb, sseMgr, &update)
			return
		}

		runID, err := uuid.Parse(update.RunID)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		stepID, _ := uuid.Parse(update.StepID)

		// ── Poster image extraction — progress event only, no DB mutation ────
		if update.StepName == "poster_image_extract" {
			status := update.Status
			if status == "" {
				status = "processing"
			}
			msg := update.ErrorMessage
			if msg == "" {
				switch status {
				case "processing":
					msg = "Extracting poster images"
				case "completed":
					msg = "Poster images extracted"
				case "failed":
					msg = "Poster image extraction failed"
				}
			}
			sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
				ID:      stepID.String(),
				Step:    "poster_image_extract",
				Status:  status,
				Message: msg,
			})
			if status == "failed" {
				if err := db.FailRunWithStep(ctx, pool, runID, update.StepName, msg); err != nil {
					log.Printf("FailRunWithStep error: %v", err)
				}
			}
			apiresp.OK(c, gin.H{"ok": true})
			return
		}

		// ── Failure path ──────────────────────────────────────────────────────
		if update.Status == "failed" {
			if err := db.FailStep(ctx, pool, stepID, update.ErrorMessage); err != nil {
				log.Printf("FailStep error: %v", err)
			}
			if err := db.FailRunWithStep(ctx, pool, runID, update.StepName, update.ErrorMessage); err != nil {
				log.Printf("FailRunWithStep error: %v", err)
			}
			go func(rID uuid.UUID, stepName, errMsg string) {
				r, err := db.GetRun(context.Background(), pool, rID)
				if err != nil {
					return
				}
				analytics.TrackPipelineStepFailed(context.Background(), rID.String(), r.PaperID.String(), stepName, errMsg, nil)
			}(runID, update.StepName, update.ErrorMessage)
			sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
				ID:      stepID.String(),
				Step:    update.StepName,
				Status:  "failed",
				Message: update.ErrorMessage,
			})
			apiresp.OK(c, gin.H{"ok": true})
			return
		}

		// ── Success path ──────────────────────────────────────────────────────
		if err := db.CompleteStep(ctx, pool, stepID, update.GCSOutputPath); err != nil {
			log.Printf("CompleteStep error: %v", err)
		}
		trackStepAnalytics(pool, runID, update.StepName, update.GCSOutputPath)

		if err := db.InsertArtifact(ctx, pool, runID, update.StepName, update.GCSOutputPath); err != nil {
			log.Printf("InsertArtifact error: %v", err)
		}
		if update.GCSOutputPathWithSubs != "" {
			if err := db.InsertArtifact(ctx, pool, runID, update.StepName+"_subs", update.GCSOutputPathWithSubs); err != nil {
				log.Printf("InsertArtifact (subs variant) error: %v", err)
			}
		}

		if ckKey := checkpointKeyForStep(update.StepName); ckKey != "" {
			if err := db.SaveCheckpoint(ctx, pool, runID, map[string]interface{}{
				ckKey: update.GCSOutputPath,
			}); err != nil {
				log.Printf("SaveCheckpoint error (non-fatal): %v", err)
			}
		}

		// Publish the per-step completed event (metadata_extract fires its own richer event below).
		if update.StepName != "metadata_extract" {
			var eventData interface{}
			if update.CompileVersion > 0 {
				eventData = map[string]interface{}{"compile_version": update.CompileVersion}
			}
			sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
				ID:      stepID.String(),
				Step:    update.StepName,
				Status:  "completed",
				Message: update.StepName + " completed",
				Data:    eventData,
			})
		}

		// ── Per-pipeline dispatch ─────────────────────────────────────────────
		switch update.StepName {
		case "podcast_pdf_extract", "podcast_script_gen", "podcast_tts":
			handlePodcastStep(ctx, c, pool, rdb, sseMgr, runID, stepID, &update)
			return
		case "reel_audio_gen", "reel_video_gen":
			handleReelStep(ctx, c, pool, rdb, sseMgr, runID, &update)
			return
		case "beamer_compile", "audio_gen":
			handleVideoParallelStep(ctx, c, pool, rdb, sseMgr, runID, stepID, &update)
			return
		case "poster_compile":
			handlePosterComplete(ctx, c, pool, sseMgr, runID, &update)
			return
		}

		// ── Pipeline complete — no next step ──────────────────────────────────
		if update.NextStep == "" {
			switch update.StepName {
			case "metadata_extract":
				handleMetadataComplete(c, pool, sseMgr, runID, stepID, &update)
			case "linkedin_draft":
				sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
					ID: stepID.String(), Step: "linkedin_draft",
					Status: "completed", Message: "LinkedIn post draft ready",
				})
				notifyDashboardAsync(pool, runID, "linkedin_draft_ready")
				apiresp.OK(c, gin.H{"ok": true})
			case "twitter_draft":
				sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
					ID: stepID.String(), Step: "twitter_draft",
					Status: "completed", Message: "X/Twitter thread draft ready",
				})
				notifyDashboardAsync(pool, runID, "twitter_draft_ready")
				apiresp.OK(c, gin.H{"ok": true})
			case "reel_script_gen", "script_gen":
				// User must confirm before next steps start.
				if update.StepName == "script_gen" && update.PaperTitle != "" {
					persistPaperMetadata(pool, runID, &update)
				}
				apiresp.OK(c, gin.H{"ok": true})
			default:
				handleVideoComplete(c, pool, sseMgr, runID, &update)
			}
			return
		}

		// ── Enqueue next step (generic path) ──────────────────────────────────
		jobData := redisx.JobData(update.NextJobData)
		if err := enqueueNextStep(ctx, pool, rdb, sseMgr, runID, update.RunID, update.NextStep, jobData); err != nil {
			log.Printf("enqueueNextStep %s error: %v", update.NextStep, err)
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue "+update.NextStep)
			return
		}
		apiresp.OK(c, gin.H{"ok": true})
	}
}

// ── Shared terminal helpers ───────────────────────────────────────────────────

func handleMetadataComplete(c *gin.Context, pool *pgxpool.Pool, sseMgr *sse.Manager, runID, stepID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	run, err := db.GetRun(gctx, pool, runID)
	if err == nil && update.PaperTitle != "" {
		if err := db.UpdatePaperMetadata(gctx, pool, run.PaperID, update.PaperTitle, update.PaperAuthors, update.PaperDate); err != nil {
			log.Printf("UpdatePaperMetadata error: %v", err)
		}
	}
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		ID:      stepID.String(),
		Step:    "metadata_extract",
		Status:  "completed",
		Message: "Paper metadata extracted",
		Data: map[string]string{
			"title":   update.PaperTitle,
			"authors": update.PaperAuthors,
		},
	})
	apiresp.OK(c, gin.H{"ok": true})
}

func handleVideoComplete(c *gin.Context, pool *pgxpool.Pool, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	if err := db.CompleteRun(gctx, pool, runID); err != nil {
		log.Printf("CompleteRun error: %v", err)
	}
	message := "Your video is ready"
	outputType := "video"
	if mode, err := db.GetRunMode(gctx, pool, runID); err == nil && mode == "podcast" && update.StepName == "ffmpeg_stitch" {
		message = "Your podcast video is ready"
		outputType = "podcast"
	}
	trackOutputAnalytics(pool, runID, outputType, update.GCSOutputPath)
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step: "pipeline", Status: "completed", Message: message,
	})
	apiresp.OK(c, gin.H{"ok": true})
}

func persistPaperMetadata(pool *pgxpool.Pool, runID uuid.UUID, update *contracts.WorkerUpdate) {
	run, err := db.GetRun(context.Background(), pool, runID)
	if err == nil {
		if err := db.UpdatePaperMetadata(context.Background(), pool, run.PaperID, update.PaperTitle, update.PaperAuthors, update.PaperDate); err != nil {
			log.Printf("UpdatePaperMetadata error: %v", err)
		}
	}
}

func notifyDashboardAsync(pool *pgxpool.Pool, runID uuid.UUID, event string) {
	go func() {
		r, err := db.GetRun(context.Background(), pool, runID)
		if err != nil {
			return
		}
		fbUID, _ := db.GetUserFirebaseUID(context.Background(), pool, r.UserID)
		analytics.NotifyDashboard(fbUID, "", event,
			map[string]string{"paper_id": r.PaperID.String()})
	}()
}

// ffmpegStitchStep creates a step row, updates run state, publishes SSE, and enqueues to ffmpeg stream.
func ffmpegStitchStep(
	_ any,
	c *gin.Context,
	pool *pgxpool.Pool,
	rdb *goredis.Client,
	sseMgr *sse.Manager,
	runID uuid.UUID,
	runIDStr string,
	jobData redisx.JobData,
	sseMessage string,
) error {
	gctx := c.Request.Context()
	stepID, err := db.CreateStep(gctx, pool, runID, "ffmpeg_stitch")
	if err != nil {
		return err
	}
	if err := db.UpdateRunCurrentStep(gctx, pool, runID, "ffmpeg_stitch", "processing"); err != nil {
		log.Printf("UpdateRunCurrentStep error: %v", err)
	}
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		ID:      stepID.String(),
		Step:    "ffmpeg_stitch",
		Status:  "processing",
		Message: sseMessage,
	})
	jobData["run_id"] = runIDStr
	jobData["step_id"] = stepID.String()
	return pipeline.TriggerFFmpeg(gctx, rdb, runIDStr, jobData)
}
