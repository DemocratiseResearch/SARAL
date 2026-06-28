package pipeline

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

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

// ── LinkedIn ──────────────────────────────────────────────────────────────────
func TriggerLinkedInDraftHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		extractedPath, err := db.GetStepOutput(ctx, pool, runID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "extraction_not_ready", "pdf extraction not complete")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		geminiKey, _, _ := db.GetUserKeys(ctx, pool, run.UserID)

		stepID, err := db.CreateStep(ctx, pool, runID, "linkedin_draft")
		if err != nil {
			log.Printf("social linkedin_draft: CreateStep run_id=%s: %v", runID, err)
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
			return
		}

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "linkedin_draft",
			Status:  "processing",
			Message: "Generating LinkedIn post draft...",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           run.PaperID.String(),
			"user_id":            run.UserID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"mode":               "linkedin_draft",
		}); err != nil {
			log.Printf("social linkedin_draft: EnqueueJob run_id=%s: %v", runID, err)
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue linkedin_draft job")
			return
		}

		apiresp.Accepted(c, gin.H{"run_id": runID.String(), "step": "linkedin_draft"})
	}
}


func GetLinkedInDraftHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "linkedin_draft")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "draft_not_ready", "LinkedIn draft not ready")
			return
		}

		raw, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_error", "failed to fetch LinkedIn draft")
			return
		}

		var draft map[string]interface{}
		if err := json.Unmarshal(raw, &draft); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "decode_error", "failed to decode LinkedIn draft")
			return
		}

		apiresp.OK(c, draft)
	}
}

// ── Twitter / X ───────────────────────────────────────────────────────────────

func TriggerTwitterDraftHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		extractedPath, err := db.GetStepOutput(ctx, pool, runID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "extraction_not_ready", "pdf extraction not complete")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		geminiKey, _, _ := db.GetUserKeys(ctx, pool, run.UserID)

		stepID, err := db.CreateStep(ctx, pool, runID, "twitter_draft")
		if err != nil {
			log.Printf("social twitter_draft: CreateStep run_id=%s: %v", runID, err)
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
			return
		}

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "twitter_draft",
			Status:  "processing",
			Message: "Generating X/Twitter thread draft...",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           run.PaperID.String(),
			"user_id":            run.UserID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"mode":               "twitter_draft",
		}); err != nil {
			log.Printf("social twitter_draft: EnqueueJob run_id=%s: %v", runID, err)
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue twitter_draft job")
			return
		}

		apiresp.Accepted(c, gin.H{"run_id": runID.String(), "step": "twitter_draft"})
	}
}

func GetTwitterDraftHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "twitter_draft")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "draft_not_ready", "Twitter draft not ready")
			return
		}

		raw, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_error", "failed to fetch Twitter draft")
			return
		}

		var thread map[string]interface{}
		if err := json.Unmarshal(raw, &thread); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "decode_error", "failed to decode Twitter draft")
			return
		}

		// Attach presigned image URLs from the pdf_extract step so the client
		// can associate images with specific tweets.
		type imageEntry struct {
			Index   int    `json:"index"`
			URL     string `json:"url"`
			GCSPath string `json:"gcs_path"`
		}
		var images []imageEntry

		if extractedGCS, imgErr := db.GetStepOutput(ctx, pool, runID, "pdf_extract"); imgErr == nil {
			if extractedRaw, dlErr := storage.DownloadJSON(ctx, extractedGCS); dlErr == nil {
				var extracted struct {
					ImagePaths []string `json:"image_paths"`
				}
				if json.Unmarshal(extractedRaw, &extracted) == nil {
					for i, imgPath := range extracted.ImagePaths {
						if url, pErr := storage.GeneratePresignedURL(ctx, imgPath, time.Hour); pErr == nil {
							images = append(images, imageEntry{Index: i, URL: url, GCSPath: imgPath})
						}
					}
				}
			}
		}

		apiresp.OK(c, gin.H{
			"thread":     thread,
			"images":     images,
			"expires_in": 3600,
		})
	}
}
