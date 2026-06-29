package webhook

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/contracts"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/sse"
)

func handlePosterComplete(ctx interface{ Done() <-chan struct{} }, c *gin.Context, pool *pgxpool.Pool, sseMgr *sse.Manager, runID uuid.UUID, update *contracts.WorkerUpdate) {
	gctx := c.Request.Context()
	if err := db.CompleteRun(gctx, pool, runID); err != nil {
		log.Printf("CompleteRun error: %v", err)
	}
	trackOutputAnalytics(pool, runID, "poster", update.GCSOutputPath)
	sseMgr.PublishEvent(gctx, runID, models.SSEEvent{
		Step: "pipeline", Status: "completed", Message: "Your poster is ready",
	})
	apiresp.OK(c, gin.H{"ok": true})
}
