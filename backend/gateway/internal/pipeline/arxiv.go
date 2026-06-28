package pipeline

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"

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

var (
	arxivIDRE    = regexp.MustCompile(`arxiv\.org/(?:abs|pdf)/([0-9]+\.[0-9]+(?:v[0-9]+)?)`)
	biorxivDOIRE = regexp.MustCompile(`(?:biorxiv|medrxiv)\.org/content/(10\.\d{4,9}/[^\s/?#]+)`)
)


func ArxivIngestHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
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

		var req struct {
			ArxivURL string `json:"arxiv_url" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "missing_arxiv_url", "arxiv_url is required")
			return
		}

		pdfURL, err := resolvePDFURL(req.ArxivURL)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_arxiv_url", err.Error())
			return
		}

		pdfBytes, err := downloadRemotePDF(pdfURL)
		if err != nil {
			apiresp.Error(c, http.StatusBadGateway, "pdf_download_failed", "could not download PDF: "+err.Error())
			return
		}

		// Use a fresh UUID as the GCS path prefix (mirrors the upload.go pattern)
		uploadPaperID := uuid.New()
		objectKey := fmt.Sprintf("%s/%s/source/paper.pdf", userID, uploadPaperID)

		storagePath, err := storage.Upload(ctx, bytes.NewReader(pdfBytes), objectKey, "application/pdf")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_upload_failed", "upload failed: "+err.Error())
			return
		}

		paperID, err := db.CreatePaperWithSourceType(ctx, pool, userID, storagePath, "arxiv")
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
			"run_id":     runID.String(),
			"step_id":    stepID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"gcs_path":   storagePath,
			"gemini_key": geminiKey,
			"sarvam_key": sarvamKey,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue pdf_extract job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"stream_url": fmt.Sprintf("/api/papertovideo/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/papertovideo/%s/status", runID),
		})

		// Fire-and-forget analytics
		go analytics.TrackPaperUpload(
			context.Background(),
			runID.String(), paperID.String(), firebaseUID, email,
			"arxiv", "", "",
		)
		// ── Webhook: notify dashboard to invalidate cache ───────────────────
		go analytics.NotifyDashboard(firebaseUID, email, "paper_uploaded",
			map[string]string{"paper_id": paperID.String()})
	}
}


func resolvePDFURL(rawURL string) (string, error) {
	if m := arxivIDRE.FindStringSubmatch(rawURL); len(m) == 2 {
		return "https://arxiv.org/pdf/" + m[1], nil
	}
	if m := biorxivDOIRE.FindStringSubmatch(rawURL); len(m) == 2 {
		if isSubstring(rawURL, "medrxiv") {
			return "https://www.medrxiv.org/content/" + m[1] + ".full.pdf", nil
		}
		return "https://www.biorxiv.org/content/" + m[1] + ".full.pdf", nil
	}
	return "", fmt.Errorf("unrecognised preprint URL; expected arxiv.org, biorxiv.org, or medrxiv.org link")
}

func isSubstring(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}


func downloadRemotePDF(url string) ([]byte, error) {
	resp, err := http.Get(url) // #nosec G107 — URL is constructed from validated regex matches
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("remote server returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return data, nil
}
