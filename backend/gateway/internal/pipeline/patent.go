package pipeline

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	redis "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)


func PatentUploadHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

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
			apiresp.Error(c, http.StatusInternalServerError, "user_upsert_failed", "user error: "+err.Error())
			return
		}

		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, userID)

		fileHeader, err := c.FormFile("pdf")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "missing_pdf", "pdf file required")
			return
		}
		file, err := fileHeader.Open()
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "file_open_failed", "cannot open file")
			return
		}
		defer file.Close()

		uploadPaperID := uuid.New()
		objectKey := fmt.Sprintf("%s/%s/source/paper.pdf", userID, uploadPaperID)

		storagePath, err := storage.Upload(ctx, file, objectKey, "application/pdf")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_upload_failed", "upload failed: "+err.Error())
			return
		}

		paperID, err := db.CreatePaperWithSourceType(ctx, pool, userID, storagePath, "patent")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "paper_create_failed", "db error: "+err.Error())
			return
		}
		runID, err := db.CreatePipelineRun(ctx, pool, paperID, userID, "video")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "run_create_failed", "db error: "+err.Error())
			return
		}
		stepID, err := db.CreateStep(ctx, pool, runID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error: "+err.Error())
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "pdf_extract", "processing")


		if _, err := redis.EnqueueJob(ctx, rdb, redis.StreamPDF, redis.JobData{
			"run_id":        runID.String(),
			"step_id":       stepID.String(),
			"paper_id":      paperID.String(),
			"user_id":       userID.String(),
			"gcs_path":      storagePath,
			"document_type": "patent",
			"gemini_key":    geminiKey,
			"sarvam_key":    sarvamKey,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue pdf_extract job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"stream_url": fmt.Sprintf("/api/patenttovideo/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/patenttovideo/%s/status", runID),
		})

		// Fire-and-forget analytics
		go analytics.TrackPaperUpload(
			context.Background(),
			runID.String(), paperID.String(), firebaseUID, email,
			"patent", "", "",
		)
		// ── Webhook: notify dashboard to invalidate cache ───────────────────
		go analytics.NotifyDashboard(firebaseUID, email, "paper_uploaded",
			map[string]string{"paper_id": paperID.String()})
	}
}
