package pipeline

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)


func BusinessBriefGenerateHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getBriefUserID(c, pool)
		if userID == uuid.Nil {
			apiresp.Error(c, http.StatusUnauthorized, "unauthorized", "user not found")
			return
		}

		// Ownership check — also confirms the paper exists.
		owner, err := db.GetPaperOwner(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		if owner != userID {
			// Same wording as run ownership check — don't leak existence.
			apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
			return
		}

		// The brief needs the paper's extracted text. If pdf_extract hasn't
		// completed yet the artifact won't exist and we surface a 409.
		textPath, err := db.GetExtractedTextPath(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusConflict, "paper_not_ready", "paper text not extracted yet — run the pipeline first")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		briefID, err := db.UpsertBusinessBrief(ctx, pool, paperID, userID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		// Optional request body — caller may specify "v1" or "v2" to override
		// the worker's BUSINESS_BRIEF_V2 env default.
		var req models.BusinessBriefGenerateRequest
		// Ignore bind errors — body is entirely optional.
		_ = c.ShouldBindJSON(&req)
		if req.ModelVersion != "v1" && req.ModelVersion != "v2" {
			req.ModelVersion = "" // let the worker decide via env default
		}

		// Pull the user's Gemini key so the worker doesn't need DB access to find it.
		geminiKey, _, _ := db.GetUserKeys(ctx, pool, userID)

		payload := redisx.JobData{
			"brief_id":   briefID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"text_path":  textPath,
			"mode":       "business_brief",
			"gemini_key": geminiKey,
		}
		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, payload); err != nil {
			// Roll the brief back to a failed state so the user isn't left
			// watching a stuck 'processing' forever.
			_ = db.FailBusinessBrief(ctx, pool, briefID, "failed to enqueue job: "+err.Error())
			apiresp.Error(c, http.StatusInternalServerError, "enqueue_failed", err.Error())
			return
		}

		// Notify any open SSE stream that generation has started.
		sseMgr.PublishBriefEvent(ctx, briefID, models.SSEEvent{
			Step:    "business_brief_script",
			Status:  "processing",
			Message: "Generating business brief content...",
		})

		c.JSON(http.StatusAccepted, gin.H{
			"success": true,
			"data": gin.H{
				"id":       briefID,
				"paper_id": paperID,
				"status":   "processing",
				"message":  "Business brief generation started",
			},
		})
	}
}


func BusinessBriefGetHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getBriefUserID(c, pool)
		brief, err := db.GetBusinessBriefByPaper(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper — generate one first")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		if brief.UserID != userID {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper — generate one first")
			return
		}

		apiresp.OK(c, brief)
	}
}


func BusinessBriefUpdateHandler(pool *pgxpool.Pool, rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getBriefUserID(c, pool)
		brief, err := db.GetBusinessBriefByPaper(ctx, pool, paperID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper — generate one first")
			return
		}
		if brief.UserID != userID {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper — generate one first")
			return
		}

		var req models.BusinessBriefUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		// Fold the user's edits over the existing sections so partial
		// updates don't wipe sections the client didn't send.
		merged := map[string]string{}
		for k, v := range brief.Sections {
			merged[k] = v
		}
		for k, v := range req.Sections {
			merged[k] = v
		}

		if err := db.UpdateBusinessBriefSections(ctx, pool, brief.ID, merged); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		// Enqueue a pdf_only re-render so the downloadable PDF matches the
		// user's edits. Failure here isn't fatal — the sections are saved.
		sectionsJSON, _ := json.Marshal(merged)
		paperTitle, _, _ := db.GetPaperMetadata(ctx, pool, brief.PaperID)
		payload := redisx.JobData{
			"brief_id":      brief.ID.String(),
			"paper_id":      paperID.String(),
			"user_id":       userID.String(),
			"text_path":     "",
			"mode":          "pdf_only",
			"sections_json": string(sectionsJSON),
			"paper_title":   paperTitle,
		}
		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamBusinessBrief, payload); err != nil {
			log.Printf("business-brief: failed to enqueue pdf re-render for %s: %v", brief.ID, err)
		}

		apiresp.OK(c, gin.H{
			"id":       brief.ID,
			"paper_id": paperID,
			"sections": merged,
			"status":   "processing", // pdf is regenerating
		})
	}
}


func BusinessBriefDownloadPDFHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getBriefUserID(c, pool)
		brief, err := db.GetBusinessBriefByPaper(ctx, pool, paperID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper")
			return
		}
		if brief.UserID != userID {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper")
			return
		}
		if brief.PDFGCSPath == "" {
			apiresp.Error(c, http.StatusConflict, "pdf_not_ready", "PDF is still being rendered — try again shortly")
			return
		}

		rc, size, err := storage.NewReader(ctx, brief.PDFGCSPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "pdf_read_failed", err.Error())
			return
		}
		defer rc.Close()

		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", `inline; filename="brief.pdf"`)
		c.Header("Content-Length", fmt.Sprintf("%d", size))
		c.Status(http.StatusOK)
		io.Copy(c.Writer, rc) //nolint:errcheck
	}
}


func getBriefUserID(c *gin.Context, pool *pgxpool.Pool) uuid.UUID {
	if uid := c.GetHeader("X-User-ID"); uid != "" {
		if id, err := uuid.Parse(uid); err == nil {
			return id
		}
		// dev bypass also accepts firebase-uid-style strings
		id, _ := db.GetUserByFirebaseUID(c.Request.Context(), pool, uid)
		return id
	}
	firebaseUID, _ := c.Get("firebase_uid")
	if s, ok := firebaseUID.(string); ok && s != "" {
		id, _ := db.GetUserByFirebaseUID(c.Request.Context(), pool, s)
		return id
	}
	return uuid.Nil
}
