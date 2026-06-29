
package analytics

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/saral/gateway/internal/apiresp"
)


func RegisterRoutes(rg *gin.RouterGroup) {
	a := rg.Group("/analytics")
	a.GET("/user/:user_id/summary", userSummaryHandler())
	a.GET("/user/:user_id/papers", userPapersHandler())
	a.GET("/user/:user_id/storage", userStorageHandler())
	a.GET("/user/:user_id/dashboard", userDashboardHandler())
	a.GET("/paper/:paper_id/details", paperDetailsHandler())
	a.GET("/storage/breakdown", storageBreakdownHandler())
	a.GET("/users/leaderboard", leaderboardHandler())
	a.GET("/platform/stats", platformStatsHandler())
	a.GET("/pipeline/:paper_id", pipelineStatusHandler())
	a.GET("/pipeline/:paper_id/runs/:run_id", pipelineRunStatusHandler())
}

// ── /analytics/user/:user_id/summary ─────────────────────────────────────────

func userSummaryHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")
		if !canAccessUser(c, userID) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "cannot access other user's data")
			return
		}
		ctx := c.Request.Context()
		summary := GetUserActivity(ctx, userID)
		if summary == nil {
			apiresp.OK(c, gin.H{
				"user_id":              userID,
				"total_papers":         0,
				"total_videos":         0,
				"total_podcasts":       0,
				"total_reels":          0,
				"total_posters":        0,
				"total_slides":         0,
				"total_business_briefs": 0,
				"last_activity":        nil,
			})
			return
		}
		apiresp.OK(c, summary)
	}
}

// ── /analytics/user/:user_id/papers ──────────────────────────────────────────

func userPapersHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")
		if !canAccessUser(c, userID) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "cannot access other user's data")
			return
		}
		limit := queryInt(c, "limit", 50)
		papers := GetPapersByUser(c.Request.Context(), userID, limit)
		apiresp.OK(c, gin.H{
			"user_id":      userID,
			"total_papers": len(papers),
			"papers":       papers,
		})
	}
}

// ── /analytics/user/:user_id/storage ─────────────────────────────────────────

func userStorageHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")
		if !canAccessUser(c, userID) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "cannot access other user's data")
			return
		}
		papers := GetPapersByUser(c.Request.Context(), userID, 1000)

		breakdown := map[string]int64{
			"videos":          0,
			"podcasts":        0,
			"reels":           0,
			"posters":         0,
			"slides":          0,
			"papers":          0,
			"business_briefs": 0,
		}

		for _, paper := range papers {
			if ts, ok := paper["temp_storage"].(map[string]interface{}); ok {
				breakdown["papers"] += int64AsInt64(ts["total_size_bytes"])
			}
			if outputs, ok := paper["processing_outputs"].(map[string]interface{}); ok {
				for outType, outRaw := range outputs {
					if outData, ok := outRaw.(map[string]interface{}); ok {
						if _, known := breakdown[outType]; known {
							breakdown[outType] += int64AsInt64(outData["size_bytes"])
						}
					}
				}
			}
		}

		var totalBytes int64
		for _, v := range breakdown {
			totalBytes += v
		}
		apiresp.OK(c, gin.H{
			"user_id":           userID,
			"storage_breakdown": breakdown,
			"total_bytes":       totalBytes,
			"total_mb":          round2(float64(totalBytes) / (1024 * 1024)),
			"total_gb":          round3(float64(totalBytes) / (1024 * 1024 * 1024)),
		})
	}
}

// ── /analytics/user/:user_id/dashboard ───────────────────────────────────────

func userDashboardHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")
		if !canAccessUser(c, userID) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "cannot access other user's data")
			return
		}
		papers := GetPapersByUser(c.Request.Context(), userID, 1000)

		papersBySource := map[string]int{}
		totalOutputs := map[string]int{}
		var paperDetails []gin.H

		for _, paper := range papers {
			sourceType := "unknown"
			if src, ok := paper["source"].(map[string]interface{}); ok {
				if t, ok := src["type"].(string); ok && t != "" {
					sourceType = t
				}
			}
			papersBySource[sourceType]++

			outputs, _ := paper["processing_outputs"].(map[string]interface{})
			var outputTypes []string
			for outType, outRaw := range outputs {
				if _, ok := outRaw.(map[string]interface{}); ok {
					outputTypes = append(outputTypes, outType)
					totalOutputs[outType]++
				}
			}

			title := paperTitle(paper)
			createdAt, _ := paper["created_at"]
			paperDetails = append(paperDetails, gin.H{
				"paper_id":    paper["paper_id"],
				"title":       title,
				"source_type": sourceType,
				"created_at":  createdAt,
				"outputs":     outputTypes,
				"status":      paper["status"],
			})
		}

		apiresp.OK(c, gin.H{
			"user_id":         userID,
			"total_papers":    len(papers),
			"papers_by_source": papersBySource,
			"total_outputs":   totalOutputs,
			"papers":          paperDetails,
		})
	}
}

// ── /analytics/paper/:paper_id/details ───────────────────────────────────────

func paperDetailsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		paperID := c.Param("paper_id")
		ctx := c.Request.Context()

		paper := GetPaperMetadata(ctx, paperID)
		if paper == nil {
			apiresp.Error(c, http.StatusNotFound, "not_found", "paper not found")
			return
		}

		// Verify ownership
		if ownerID, ok := paper["user_id"].(string); ok && ownerID != "" {
			if !canAccessUser(c, ownerID) {
				apiresp.Error(c, http.StatusForbidden, "forbidden", "cannot access other user's papers")
				return
			}
		}

		apiresp.OK(c, paper)
	}
}

// ── /analytics/storage/breakdown (admin) ─────────────────────────────────────

func storageBreakdownHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isAdmin(c) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "admin access required")
			return
		}
		breakdown := GetStorageBreakdown(c.Request.Context())
		var total int64
		for _, v := range breakdown {
			total += v
		}
		apiresp.OK(c, gin.H{
			"storage_breakdown": breakdown,
			"total_bytes":       total,
			"total_gb":          round2(float64(total) / (1024 * 1024 * 1024)),
		})
	}
}

// ── /analytics/users/leaderboard (admin) ─────────────────────────────────────

func leaderboardHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isAdmin(c) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "admin access required")
			return
		}
		metric := c.DefaultQuery("metric", "total_papers")
		validMetrics := map[string]bool{
			"total_papers": true, "total_videos": true, "total_podcasts": true,
			"total_reels": true, "total_posters": true, "total_slides": true,
			"total_business_briefs": true,
		}
		if !validMetrics[metric] {
			apiresp.Error(c, http.StatusBadRequest, "invalid_metric", "invalid metric")
			return
		}
		apiresp.OK(c, gin.H{
			"metric": metric,
			"limit":  queryInt(c, "limit", 10),
			"users":  []interface{}{},
			"note":   "Leaderboard requires a Firestore composite index",
		})
	}
}

// ── /analytics/platform/stats (admin) ────────────────────────────────────────

func platformStatsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isAdmin(c) {
			apiresp.Error(c, http.StatusForbidden, "forbidden", "admin access required")
			return
		}
		ctx := c.Request.Context()

		// Aggregate counters from all user_activity_summary docs
		totals := map[string]int64{
			"total_papers":          0,
			"total_videos":          0,
			"total_podcasts":        0,
			"total_reels":           0,
			"total_posters":         0,
			"total_slides":          0,
			"total_business_briefs": 0,
			"total_logins":          0,
		}
		if fsClient != nil {
			iter := fsClient.Collection(CollUserActivity).Documents(ctx)
			defer iter.Stop()
			for {
				snap, err := iter.Next()
				if err != nil {
					break
				}
				data := snap.Data()
				for k := range totals {
					totals[k] += int64AsInt64(data[k])
				}
			}
		}

		apiresp.OK(c, gin.H{
			"platform_stats": totals,
		})
	}
}

// ── /analytics/pipeline/:paper_id ────────────────────────────────────────────

// pipelineStatusHandler returns all pipeline runs for a paper, newest first.
func pipelineStatusHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		paperID := c.Param("paper_id")
		runs := GetPipelinesByPaper(c.Request.Context(), paperID)
		if runs == nil {
			runs = []map[string]interface{}{}
		}
		apiresp.OK(c, runs)
	}
}

// pipelineRunStatusHandler returns the status of a specific pipeline run.
func pipelineRunStatusHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		paperID := c.Param("paper_id")
		runID := c.Param("run_id")
		status := GetPipelineStatus(c.Request.Context(), runID, paperID)
		if status == nil {
			apiresp.Error(c, http.StatusNotFound, "not_found", "pipeline run not found")
			return
		}
		apiresp.OK(c, status)
	}
}

// ── access-control helpers ────────────────────────────────────────────────────

// adminUIDs is a comma-separated list of Firebase UIDs with admin access.
// Set via SARAL_ADMIN_UIDS environment variable.
var adminUIDs = func() map[string]bool {
	m := map[string]bool{}
	for _, uid := range strings.Split(os.Getenv("SARAL_ADMIN_UIDS"), ",") {
		uid = strings.TrimSpace(uid)
		if uid != "" {
			m[uid] = true
		}
	}
	return m
}()

func isAdmin(c *gin.Context) bool {
	uid := c.GetString("firebase_uid")
	return adminUIDs[uid]
}

func canAccessUser(c *gin.Context, targetUID string) bool {
	callerUID := c.GetString("firebase_uid")
	return callerUID == targetUID || isAdmin(c)
}

// ── small utility functions ───────────────────────────────────────────────────

func queryInt(c *gin.Context, key string, def int) int {
	s := c.Query(key)
	if s == "" {
		return def
	}
	var v int
	if n, _ := fmt.Sscanf(s, "%d", &v); n == 1 && v > 0 {
		return v
	}
	return def
}

func paperTitle(paper map[string]interface{}) string {
	if t, ok := paper["title"].(string); ok && t != "" {
		return t
	}
	if meta, ok := paper["metadata"].(map[string]interface{}); ok {
		if t, ok := meta["title"].(string); ok && t != "" {
			return t
		}
	}
	if src, ok := paper["source"].(map[string]interface{}); ok {
		if f, ok := src["filename"].(string); ok && f != "" {
			return f
		}
	}
	return "untitled"
}

func round2(f float64) float64 {
	return float64(int64(f*100)) / 100
}

func round3(f float64) float64 {
	return float64(int64(f*1000)) / 1000
}
