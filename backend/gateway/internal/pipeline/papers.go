package pipeline

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
)


func PapersHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		// Get Firebase UID from auth middleware
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

		// Get or create user in Postgres
		userID, err := db.UpsertUser(ctx, pool, firebaseUID, email, provider)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "user_error", "failed to get user: "+err.Error())
			return
		}

		// Fetch all papers for this user
		papers, err := db.GetPapersByUser(ctx, pool, userID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to fetch papers: "+err.Error())
			return
		}

		apiresp.OK(c, gin.H{
			"papers": papers,
			"count":  len(papers),
		})
	}
}
