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

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/contracts"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)

func handleBriefWebhook(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()

	if update.StepName == "business_brief" {
		handleBriefComplete(gctx, c, pool, sseMgr, update)
		return
	}
	// business_brief_script: Gemini done → enqueue PDF render
	handleBriefScript(gctx, c, pool, rdb, sseMgr, update)
}

func handleBriefComplete(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, sseMgr *sse.Manager, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	briefID, err := uuid.Parse(update.BriefID)
	if err != nil {
		apiresp.Error(c, http.StatusBadRequest, "invalid_brief_id", "invalid brief_id")
		return
	}
	switch update.Status {
	case "completed":
		if len(update.Sections) == 0 && update.PDFGCSPath != "" {
			if err := db.SetBusinessBriefPDF(gctx, pool, briefID, update.PDFGCSPath); err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
				return
			}
		} else {
			if err := db.CompleteBusinessBrief(gctx, pool, briefID,
				update.Sections, update.ModelVersion,
				update.JSONGCSPath, update.PDFGCSPath,
			); err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
				return
			}
		}
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step:    "business_brief_pdf_render",
			Status:  "completed",
			Message: "Business brief is ready",
		})
		go func(bID uuid.UUID, gcsPath string) {
			brief, err := db.GetBusinessBrief(context.Background(), pool, bID)
			if err != nil {
				return
			}
			analytics.TrackOutputGeneration(context.Background(), brief.PaperID.String(), brief.UserID.String(), "business_brief", gcsPath, 0, 0)
		}(briefID, update.PDFGCSPath)
	case "failed":
		if err := db.FailBusinessBrief(gctx, pool, briefID, update.ErrorMessage); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step:    "business_brief_pdf_render",
			Status:  "failed",
			Message: update.ErrorMessage,
		})
	default:
		apiresp.Error(c, http.StatusBadRequest, "invalid_status", "status must be 'completed' or 'failed'")
		return
	}
	apiresp.OK(c, gin.H{"received": true})
}

func handleBriefScript(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	briefID, err := uuid.Parse(update.BriefID)
	if err != nil {
		apiresp.Error(c, http.StatusBadRequest, "invalid_brief_id", "invalid brief_id")
		return
	}
	if update.Status == "failed" {
		if err := db.FailBusinessBrief(gctx, pool, briefID, update.ErrorMessage); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step:    "business_brief_script",
			Status:  "failed",
			Message: update.ErrorMessage,
		})
		apiresp.OK(c, gin.H{"received": true})
		return
	}

	sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
		Step: "business_brief_script", Status: "completed",
		Message: "Business brief content generated",
	})
	sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
		Step: "business_brief_prepare_pdf", Status: "processing",
		Message: "Preparing brief data for PDF rendering...",
	})

	sectionsRaw, dErr := storage.DownloadJSON(gctx, update.GCSOutputPath)
	if dErr != nil {
		errMsg := "failed to download sections: " + dErr.Error()
		_ = db.FailBusinessBrief(gctx, pool, briefID, errMsg)
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step: "business_brief_prepare_pdf", Status: "failed", Message: errMsg,
		})
		apiresp.Error(c, http.StatusInternalServerError, "storage_error", dErr.Error())
		return
	}

	var payload struct {
		Sections     map[string]string `json:"sections"`
		ModelVersion string            `json:"model_version"`
	}
	if err := json.Unmarshal(sectionsRaw, &payload); err != nil {
		errMsg := "failed to parse sections: " + err.Error()
		_ = db.FailBusinessBrief(gctx, pool, briefID, errMsg)
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step: "business_brief_prepare_pdf", Status: "failed", Message: errMsg,
		})
		apiresp.Error(c, http.StatusInternalServerError, "parse_error", err.Error())
		return
	}

	if err := db.SetBusinessBriefScript(gctx, pool, briefID, payload.Sections, payload.ModelVersion, update.GCSOutputPath); err != nil {
		log.Printf("SetBusinessBriefScript error: %v", err)
	}

	brief, bErr := db.GetBusinessBrief(gctx, pool, briefID)
	if bErr != nil {
		apiresp.Error(c, http.StatusInternalServerError, "db_error", bErr.Error())
		return
	}

	sectionsJSON, _ := json.Marshal(payload.Sections)
	pdfPayload := redisx.JobData{
		"brief_id":      briefID.String(),
		"paper_id":      brief.PaperID.String(),
		"user_id":       brief.UserID.String(),
		"text_path":     "",
		"mode":          "pdf_only",
		"sections_json": string(sectionsJSON),
		"paper_title":   update.PaperTitle,
	}
	if _, enqErr := redisx.EnqueueJob(gctx, rdb, redisx.StreamBusinessBrief, pdfPayload); enqErr != nil {
		errMsg := "failed to enqueue PDF render: " + enqErr.Error()
		_ = db.FailBusinessBrief(gctx, pool, briefID, errMsg)
		sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
			Step: "business_brief_prepare_pdf", Status: "failed", Message: errMsg,
		})
		apiresp.Error(c, http.StatusInternalServerError, "enqueue_failed", enqErr.Error())
		return
	}

	sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
		Step: "business_brief_prepare_pdf", Status: "completed",
		Message: "Brief data prepared for PDF rendering",
	})
	sseMgr.PublishBriefEvent(gctx, briefID, models.SSEEvent{
		Step: "business_brief_pdf_render", Status: "processing",
		Message: "Rendering PDF...",
	})
	apiresp.OK(c, gin.H{"received": true})
}
