package pipeline

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

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


func SlidesPaperStartHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
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

		extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, paperID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "paper_not_extracted", "no completed pdf_extract found for this paper — upload via /papertovideo/upload first")
			return
		}

		geminiKey, _, _ := db.GetUserKeys(ctx, pool, userID)

		runID, err := db.CreatePipelineRun(ctx, pool, paperID, userID, "slides")
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
			Message: "Generating presentation script",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           paperID.String(),
			"user_id":            userID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"mode":               "slides_deck",
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue slides script job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"stream_url": fmt.Sprintf("/api/papertoslides/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/papertoslides/%s/status", runID),
		})
		go analytics.InitPipelineTracking(context.Background(), runID.String(), paperID.String(), firebaseUID, "slides")
	}
}


func SlidesTemplateUploadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		mode, err := db.GetRunMode(ctx, pool, runID)
		if err != nil || mode != "slides" {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run", "run is not a papertoslides pipeline")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		fh, err := c.FormFile("template")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "missing_template", "multipart field 'template' with .pptx file is required")
			return
		}
		if fh.Size > 40<<20 {
			apiresp.Error(c, http.StatusBadRequest, "template_too_large", "template must be 40MB or smaller")
			return
		}

		file, err := fh.Open()
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "file_open_failed", "cannot open upload")
			return
		}
		defer file.Close()

		objectKey := fmt.Sprintf("%s/%s/runs/%s/slides_template/user_template.pptx", run.UserID, run.PaperID, runID)
		storagePath, err := storage.Upload(ctx, file, objectKey,
			"application/vnd.openxmlformats-officedocument.presentationml.presentation")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_upload_failed", err.Error())
			return
		}

		if err := db.SetSlidesTemplatePath(ctx, pool, runID, storagePath); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to save template path")
			return
		}

		apiresp.OK(c, gin.H{"template_gcs_path": storagePath, "message": "template saved"})
	}
}


func SlidesConfirmHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		mode, err := db.GetRunMode(ctx, pool, runID)
		if err != nil || mode != "slides" {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run", "run is not a papertoslides pipeline")
			return
		}

		var req struct {
			OutputFormat  string `json:"output_format"`
			PPTTemplate   string `json:"ppt_template"`
			Language      string `json:"language"`
			SlideLanguage string `json:"slide_language"`
		}
		_ = c.ShouldBindJSON(&req)
		req.Language = normalizeLanguage(req.Language)
		req.SlideLanguage = normalizeLanguage(req.SlideLanguage)
		if req.SlideLanguage == "" {
			req.SlideLanguage = req.Language
		}
		if req.OutputFormat == "" {
			req.OutputFormat = "beamer_pdf"
		}
		if req.OutputFormat == "ppt" && strings.TrimSpace(req.PPTTemplate) == "" {
			req.PPTTemplate = DefaultPPTTemplate
		}

		scriptPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "script_not_ready", "script not ready")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		extractedPath, err := db.GetExtractedJSONPathForRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "extraction_not_ready", "extracted document not available")
			return
		}

		patch := map[string]interface{}{
			"output_format": req.OutputFormat,
		}
		if req.PPTTemplate != "" {
			patch["ppt_template"] = req.PPTTemplate
		}
		if req.Language != "" {
			patch["language"] = req.Language
		}
		if req.SlideLanguage != "" {
			patch["slide_language"] = req.SlideLanguage
		}
		_ = patchStoredScriptJSON(ctx, scriptPath, patch)

		beamerStepID, err := db.CreateStep(ctx, pool, runID, "beamer_compile")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error creating beamer step")
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "beamer_compile", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      beamerStepID.String(),
			Step:    "beamer_compile",
			Status:  "processing",
			Message: "Building slides",
		})

		templatePath, _ := db.GetSlidesTemplatePath(ctx, pool, runID)

		if err := enqueueBeamerCompile(ctx, rdb, runID, beamerStepID, run, scriptPath, extractedPath, BeamerJobOpts{
			OutputFormat:          req.OutputFormat,
			PPTTemplate:           req.PPTTemplate,
			TemplateGCSPath:       templatePath,
			SlideExportPDFPrimary: req.OutputFormat == "ppt",
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue slide compile job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"message":    "beamer_compile started",
			"next_steps": []string{"beamer_compile"},
		})
	}
}


func SlidesDeckURLsHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		mode, err := db.GetRunMode(ctx, pool, runID)
		if err != nil || mode != "slides" {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run", "run is not a papertoslides pipeline")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		out := gin.H{"expires_in": 3600}
		bucket := os.Getenv("STORAGE_BUCKET")
		if bucket == "" {
			bucket = "saral-artifacts-local"
		}
		baseKey := fmt.Sprintf("%s/%s/runs/%s/beamer_compile", run.UserID, run.PaperID, runID)

		if v := c.Query("compile_version"); v != "" {
			baseKey = baseKey + "/v" + v
			out["compile_version"] = v
		}

		tryURL := func(filename string) string {
			path := "gs://" + bucket + "/" + baseKey + "/" + filename
			url, err := storage.GeneratePresignedURL(ctx, path, time.Hour)
			if err != nil {
				return ""
			}
			return url
		}

		if u := tryURL("slides.pdf"); u != "" {
			out["slides_pdf_url"] = u
		}
		if u := tryURL("slides.pptx"); u != "" {
			out["slides_pptx_url"] = u
		}

		apiresp.OK(c, out)
	}
}
