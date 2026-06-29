package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	redis "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
)


func PodcastStartHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
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

		var body struct {
			PaperID     string `json:"paper_id" binding:"required"`
			Language    string `json:"language"`
			HostAGender string `json:"host_a_gender"`
			HostBGender string `json:"host_b_gender"`
			RenderVideo *bool  `json:"render_video"`
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
		language := normalizeLanguage(body.Language)
		if language == "" {
			language = "en-IN"
		}
		hostAGender := normalizePodcastGender(body.HostAGender, "female")
		hostBGender := normalizePodcastGender(body.HostBGender, "male")
		renderVideo := true
		if body.RenderVideo != nil {
			renderVideo = *body.RenderVideo
		}

		// Reuse the most recent pdf_extract output for this paper
		extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, paperID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "paper_not_extracted", "paper extraction data not found")
			return
		}

		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, userID)

		// Create a new podcast pipeline run (no pdf_extract step needed)
		runID, err := db.CreatePipelineRun(ctx, pool, paperID, userID, "podcast")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "run_create_failed", "db error: "+err.Error())
			return
		}

		stepID, err := db.CreateStep(ctx, pool, runID, "podcast_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error: "+err.Error())
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "podcast_script_gen", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "podcast_script_gen",
			Status:  "processing",
			Message: "Generating podcast script from paper...",
		})

		if _, err := redis.EnqueueJob(ctx, rdb, redis.StreamScript, redis.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           paperID.String(),
			"user_id":            userID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"sarvam_key":         sarvamKey,
			"mode":               "podcast",
			"language":           language,
			"host_a_gender":      hostAGender,
			"host_b_gender":      hostBGender,
			"render_video":       fmt.Sprintf("%t", renderVideo),
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue podcast_script_gen")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"stream_url": fmt.Sprintf("/api/papertopodcast/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/papertopodcast/%s/status", runID),
		})
		go analytics.InitPipelineTracking(context.Background(), runID.String(), paperID.String(), firebaseUID, "podcast")
	}
}

func normalizePodcastGender(s, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "male", "m":
		return "male"
	case "female", "f":
		return "female"
	case "":
		return fallback
	default:
		return fallback
	}
}


func PodcastScriptHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		// Get podcast_script_gen step output path
		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "podcast_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "script not ready or not found")
			return
		}

		// Download JSON from GCS
		data, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}

		var script models.PodcastScript
		if err := json.Unmarshal(data, &script); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}

		apiresp.OK(c, script)
	}
}


func PodcastAudioDownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetArtifact(ctx, pool, runID, "podcast_tts")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "audio_not_ready", "audio not ready")
			return
		}

		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_failed", "could not access audio")
			return
		}

		c.Header("Content-Disposition", `attachment; filename="podcast.wav"`)
		c.Header("Content-Type", "audio/wav")
		c.Header("Accept-Ranges", "bytes")

		rangeHeader := c.GetHeader("Range")
		if rangeHeader == "" {
			rc, err := storage.NewRangeReader(ctx, gcsPath, 0, -1)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "audio_failed", "could not open audio")
				return
			}
			defer rc.Close()
			c.Header("Content-Length", fmt.Sprintf("%d", size))
			c.Status(http.StatusOK)
			io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
			return
		}

		rangeVal := strings.TrimPrefix(rangeHeader, "bytes=")
		parts := strings.SplitN(rangeVal, "-", 2)
		if len(parts) != 2 {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		var start, end int64
		if parts[0] == "" {
			n, _ := strconv.ParseInt(parts[1], 10, 64)
			start = size - n
			end = size - 1
		} else {
			start, _ = strconv.ParseInt(parts[0], 10, 64)
			if parts[1] == "" {
				end = size - 1
			} else {
				end, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		}
		if start < 0 || end >= size || start > end {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		rc, err := storage.NewRangeReader(ctx, gcsPath, start, end-start+1)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_failed", "could not open audio")
			return
		}
		defer rc.Close()
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
		c.Header("Content-Length", fmt.Sprintf("%d", end-start+1))
		c.Status(http.StatusPartialContent)
		io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
	}
}


func PodcastDownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()
		runIDStr := c.Param("run_id")

		// Audio is mandatory — fail fast if not ready
		if _, err := db.GetArtifact(ctx, pool, runID, "podcast_tts"); err != nil {
			apiresp.Error(c, http.StatusNotFound, "audio_not_ready", "audio not ready")
			return
		}

		resp := gin.H{
			"audio": gin.H{
				"url": fmt.Sprintf("/api/papertopodcast/%s/audio", runIDStr),
			},
		}

		// Video is optional (only present when render_video=true and pipeline completed)
		if _, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch"); err == nil {
			resp["video"] = gin.H{
				"url": fmt.Sprintf("/api/papertopodcast/%s/video", runIDStr),
			}
		}

		apiresp.OK(c, resp)
	}
}


func PodcastVideoDownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_ready", "video not ready")
			return
		}

		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "video_failed", "could not access video")
			return
		}

		c.Header("Content-Disposition", `attachment; filename="podcast_video.mp4"`)
		c.Header("Content-Type", "video/mp4")
		c.Header("Accept-Ranges", "bytes")

		rangeHeader := c.GetHeader("Range")
		if rangeHeader == "" {
			rc, err := storage.NewRangeReader(ctx, gcsPath, 0, -1)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "video_failed", "could not open video")
				return
			}
			defer rc.Close()
			c.Header("Content-Length", fmt.Sprintf("%d", size))
			c.Status(http.StatusOK)
			io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
			return
		}

		rangeVal := strings.TrimPrefix(rangeHeader, "bytes=")
		parts := strings.SplitN(rangeVal, "-", 2)
		if len(parts) != 2 {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		var start, end int64
		if parts[0] == "" {
			n, _ := strconv.ParseInt(parts[1], 10, 64)
			start = size - n
			end = size - 1
		} else {
			start, _ = strconv.ParseInt(parts[0], 10, 64)
			if parts[1] == "" {
				end = size - 1
			} else {
				end, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		}
		if start < 0 || end >= size || start > end {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		rc, err := storage.NewRangeReader(ctx, gcsPath, start, end-start+1)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "video_failed", "could not open video")
			return
		}
		defer rc.Close()
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
		c.Header("Content-Length", fmt.Sprintf("%d", end-start+1))
		c.Status(http.StatusPartialContent)
		io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
	}
}
