package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)


func PosterStartHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		firebaseUID, email, provider := firebaseIdentityFromContext(c)

		userID, err := db.UpsertUser(ctx, pool, firebaseUID, email, provider)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "user_upsert_failed", "user error: "+err.Error())
			return
		}

		var body struct {
			PaperID string `json:"paper_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_body", "paper_id is required")
			return
		}
		paperID, err := uuid.Parse(body.PaperID)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "paper_id must be a valid UUID")
			return
		}

		// Reuse the most recent pdf_extract output for this paper
		extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, paperID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "paper_not_extracted", "no completed pdf_extract found for this paper — upload and process it via the video pipeline first")
			return
		}

		geminiKey, _, _ := db.GetUserKeys(ctx, pool, userID)

		// Create a new poster pipeline run (no pdf_extract step needed)
		runID, err := db.CreatePipelineRun(ctx, pool, paperID, userID, "poster")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "run_create_failed", "db error: "+err.Error())
			return
		}

		stepID, err := db.CreateStep(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error creating script_gen step")
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "script_gen", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "script_gen",
			Status:  "processing",
			Message: "Generating poster content",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":              runID.String(),
			"step_id":             stepID.String(),
			"paper_id":            paperID.String(),
			"user_id":             userID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":          geminiKey,
			"mode":                "poster",
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue script_gen job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"stream_url": fmt.Sprintf("/api/papertoposter/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/papertoposter/%s/status", runID),
		})
		go analytics.InitPipelineTracking(context.Background(), runID.String(), paperID.String(), firebaseUID, "poster")
	}
}


func PosterContentHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		gcsPath, err := db.GetStepOutput(c.Request.Context(), pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "content_not_ready", "poster content not generated yet")
			return
		}

		data, err := storage.DownloadJSON(c.Request.Context(), gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "content_fetch_failed", "failed to fetch poster content")
			return
		}

		var content any
		if err := json.Unmarshal(data, &content); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "content_decode_failed", "failed to decode poster content")
			return
		}

		apiresp.OK(c, content)
	}
}


func PosterConfirmHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		posterContentPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "content_not_ready", "poster content not ready")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		geminiKey, _, _ := db.GetUserKeys(ctx, pool, run.UserID)

		// Fetch extracted.json GCS path to bundle all parsed images in the ZIP.
		extractedPath, _ := db.GetLatestStepOutputForPaper(ctx, pool, run.PaperID, "pdf_extract")

		stepID, err := db.CreateStep(ctx, pool, runID, "poster_compile")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error creating poster_compile step")
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "poster_compile", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "poster_compile",
			Status:  "processing",
			Message: "Compiling poster",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamPoster, redisx.JobData{
			"run_id":                  runID.String(),
			"step_id":                 stepID.String(),
			"paper_id":                run.PaperID.String(),
			"user_id":                 run.UserID.String(),
			"poster_content_gcs_path": posterContentPath,
			"gemini_key":              geminiKey,
			"extracted_gcs_path":      extractedPath,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue poster_compile job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"message":  "poster_compile started",
			"next_step": "poster_compile",
		})
	}
}


func PosterDownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "poster_compile")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "poster_not_ready", "poster not ready yet")
			return
		}

		rc, size, err := storage.NewReader(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "download_failed", "could not open poster for download")
			return
		}
		defer rc.Close()

		c.Header("Content-Disposition", "attachment; filename=\"poster.zip\"")
		c.Header("Content-Type", "application/zip")
		c.Header("Content-Length", fmt.Sprintf("%d", size))
		c.Status(http.StatusOK)
		io.Copy(c.Writer, rc)
	}
}
