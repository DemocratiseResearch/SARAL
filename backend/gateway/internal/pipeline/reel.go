package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
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


func ReelStartHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		var firebaseUID, email string
		if uid := c.GetHeader("X-User-ID"); uid != "" {
			firebaseUID = uid
			email = uid + "@local.dev"
		} else {
			firebaseUID = c.MustGet("firebase_uid").(string)
			email = c.GetString("email")
		}

		userID, err := db.UpsertUser(ctx, pool, firebaseUID, email, "local")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "user_upsert_failed", "user error: "+err.Error())
			return
		}

		var body struct {
			PaperID  string `json:"paper_id" binding:"required"`
			Language string `json:"language"`
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

		extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, paperID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "paper_not_extracted", "paper extraction data not found")
			return
		}

		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, userID)

		runID, err := db.CreatePipelineRun(ctx, pool, paperID, userID, "reel")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "run_create_failed", "db error: "+err.Error())
			return
		}

		stepID, err := db.CreateStep(ctx, pool, runID, "reel_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error: "+err.Error())
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "reel_script_gen", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "reel_script_gen",
			Status:  "processing",
			Message: "Generating reel dialogue from paper...",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           paperID.String(),
			"user_id":            userID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"sarvam_key":         sarvamKey,
			"mode":               "reel",
			"language":           language,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue reel_script_gen")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"paper_id":   paperID.String(),
			"user_id":    userID.String(),
			"stream_url": fmt.Sprintf("/api/papertoreel/%s/stream", runID),
			"status_url": fmt.Sprintf("/api/papertoreel/%s/status", runID),
		})
		go analytics.InitPipelineTracking(context.Background(), runID.String(), paperID.String(), firebaseUID, "reel")
	}
}


func ReelScriptHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "reel_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "script not ready or not found")
			return
		}

		data, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}

		var script models.ReelScript
		if err := json.Unmarshal(data, &script); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}

		apiresp.OK(c, script)
	}
}


func ReelUpdateScriptHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "reel_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "script not ready")
			return
		}

		existingBytes, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}
		var existing models.ReelScript
		if err := json.Unmarshal(existingBytes, &existing); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode existing script")
			return
		}

		var incoming models.ReelScript
		if err := c.ShouldBindJSON(&incoming); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_body", "invalid script payload")
			return
		}
		if len(incoming.Turns) < 4 || len(incoming.Turns) > 12 {
			apiresp.Error(c, http.StatusBadRequest, "invalid_turn_count", "turns must be between 4 and 12")
			return
		}
		for i, t := range incoming.Turns {
			speaker := strings.TrimSpace(t.Speaker)
			text := strings.TrimSpace(t.Text)
			if text == "" {
				apiresp.Error(c, http.StatusBadRequest, "empty_turn_text", fmt.Sprintf("turn %d has empty text", i))
				return
			}
			if speaker != "Person1" && speaker != "Person2" {
				apiresp.Error(c, http.StatusBadRequest, "invalid_speaker", fmt.Sprintf("turn %d speaker must be Person1 or Person2", i))
				return
			}
			incoming.Turns[i].Speaker = speaker
			incoming.Turns[i].Text = text
		}

		// Preserve immutable fields from existing; allow user to edit title/turns/language.
		existing.Turns = incoming.Turns
		if strings.TrimSpace(incoming.Title) != "" {
			existing.Title = strings.TrimSpace(incoming.Title)
		}
		if strings.TrimSpace(incoming.Language) != "" {
			existing.Language = normalizeLanguage(incoming.Language)
		}
		existing.Analysis = analyzeReelTurnsForGateway(existing.Turns)

		updated, err := json.Marshal(existing)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_encode_failed", "failed to encode script")
			return
		}
		key := storage.ExtractKey(gcsPath)
		if _, err := storage.UploadBytes(ctx, updated, key, "application/json"); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_save_failed", "failed to save script")
			return
		}

		apiresp.OK(c, existing)
	}
}


func ReelAvatarsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		urlCache := map[string]string{} // filename -> presigned URL (dedupe across pairs)
		presign := func(filename string) string {
			if u, ok := urlCache[filename]; ok {
				return u
			}
			u, err := storage.GeneratePresignedURL(ctx, models.ReelAvatarGCSPrefix+filename, time.Hour)
			if err != nil {
				return ""
			}
			urlCache[filename] = u
			return u
		}

		out := make([]gin.H, 0, len(models.AvailableReelAvatarPairs))
		for _, p := range models.AvailableReelAvatarPairs {
			out = append(out, gin.H{
				"id":           p.ID,
				"name":         p.Name,
				"description":  p.Description,
				"person1":      p.Person1,
				"person2":      p.Person2,
				"person1_url":  presign(p.Person1),
				"person2_url":  presign(p.Person2),
			})
		}

		apiresp.OK(c, gin.H{
			"pairs":      out,
			"expires_in": 3600,
		})
	}
}


func ReelAvatarSelectionHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		var body struct {
			Pair string `json:"pair" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_body", "pair is required")
			return
		}
		pair := models.LookupReelAvatarPair(body.Pair)
		if pair == nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_pair", "unknown avatar pair id")
			return
		}

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "reel_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "script not ready")
			return
		}
		raw, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}
		var script models.ReelScript
		if err := json.Unmarshal(raw, &script); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}

		bucket := storage.BucketName()
		script.Avatars = &models.ReelAvatarSelection{
			Pair:    pair.ID,
			Person1: fmt.Sprintf("gs://%s/%s%s", bucket, models.ReelAvatarGCSPrefix, pair.Person1),
			Person2: fmt.Sprintf("gs://%s/%s%s", bucket, models.ReelAvatarGCSPrefix, pair.Person2),
		}

		updated, err := json.Marshal(script)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_encode_failed", "failed to encode script")
			return
		}
		key := storage.ExtractKey(gcsPath)
		if _, err := storage.UploadBytes(ctx, updated, key, "application/json"); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_save_failed", "failed to save script")
			return
		}

		person1URL, _ := storage.GeneratePresignedURL(ctx, script.Avatars.Person1, time.Hour)
		person2URL, _ := storage.GeneratePresignedURL(ctx, script.Avatars.Person2, time.Hour)
		apiresp.OK(c, gin.H{
			"pair":        pair.ID,
			"person1":     pair.Person1,
			"person2":     pair.Person2,
			"person1_url": person1URL,
			"person2_url": person2URL,
		})
	}
}


func ReelFinalizeHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		scriptPath, err := db.GetStepOutput(ctx, pool, runID, "reel_script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "script_not_ready", "script not ready")
			return
		}
		raw, err := storage.DownloadJSON(ctx, scriptPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}
		var script models.ReelScript
		if err := json.Unmarshal(raw, &script); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}
		if script.Avatars == nil || script.Avatars.Pair == "" {
			apiresp.Error(c, http.StatusBadRequest, "avatars_not_selected", "select an avatar pair before finalizing")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, run.UserID)

		audioStepID, err := db.CreateStep(ctx, pool, runID, "reel_audio_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error: "+err.Error())
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "reel_audio_gen", "processing")
		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      audioStepID.String(),
			Step:    "reel_audio_gen",
			Status:  "processing",
			Message: "Generating reel audio per turn...",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamAudio, redisx.JobData{
			"run_id":          runID.String(),
			"step_id":         audioStepID.String(),
			"paper_id":        run.PaperID.String(),
			"user_id":         run.UserID.String(),
			"script_gcs_path": scriptPath,
			"pipeline_type":   "reel",
			"gemini_key":      geminiKey,
			"sarvam_key":      sarvamKey,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue reel_audio_gen")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":     runID.String(),
			"next_step":  "reel_audio_gen",
			"stream_url": fmt.Sprintf("/api/papertoreel/%s/stream", runID),
		})
	}
}


func ReelDownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		gcsPath, err := db.GetArtifact(ctx, pool, runID, "reel_video_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_ready", "reel video not ready")
			return
		}

		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "download_failed", "could not access video")
			return
		}

		c.Header("Content-Disposition", `attachment; filename="reel.mp4"`)
		c.Header("Content-Type", "video/mp4")
		c.Header("Accept-Ranges", "bytes")

		rangeHeader := c.GetHeader("Range")
		if rangeHeader == "" {
			rc, err := storage.NewRangeReader(ctx, gcsPath, 0, -1)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "download_failed", "could not open video")
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
			apiresp.Error(c, http.StatusInternalServerError, "download_failed", "could not open video")
			return
		}
		defer rc.Close()
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
		c.Header("Content-Length", fmt.Sprintf("%d", end-start+1))
		c.Status(http.StatusPartialContent)
		io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
	}
}


func ReelVideoStreamHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		gcsPath, err := db.GetArtifact(ctx, pool, runID, "reel_video_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_ready", "reel video not ready")
			return
		}
		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not access video")
			return
		}

		c.Header("Accept-Ranges", "bytes")
		c.Header("Content-Type", "video/mp4")

		rangeHeader := c.GetHeader("Range")
		if rangeHeader == "" {
			rc, err := storage.NewRangeReader(ctx, gcsPath, 0, -1)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not open video")
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
			n, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil || n <= 0 {
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			if n > size {
				n = size
			}
			start = size - n
			end = size - 1
		} else {
			start, err = strconv.ParseInt(parts[0], 10, 64)
			if err != nil || start < 0 || start >= size {
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			if parts[1] == "" {
				end = size - 1
			} else {
				end, err = strconv.ParseInt(parts[1], 10, 64)
				if err != nil || end < start {
					c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
					c.Status(http.StatusRequestedRangeNotSatisfiable)
					return
				}
				if end >= size {
					end = size - 1
				}
			}
		}

		length := end - start + 1
		rc, err := storage.NewRangeReader(ctx, gcsPath, start, length)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not open video range")
			return
		}
		defer rc.Close()

		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
		c.Header("Content-Length", fmt.Sprintf("%d", length))
		c.Status(http.StatusPartialContent)
		io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
	}
}

// analyzeReelTurnsForGateway recomputes lightweight stats after the user edits the script.
func analyzeReelTurnsForGateway(turns []models.ReelTurn) models.ReelAnalysis {
	a := models.ReelAnalysis{
		TurnCount:         len(turns),
		SpeakerTurnCounts: map[string]int{"Person1": 0, "Person2": 0},
		SpeakerWordCounts: map[string]int{"Person1": 0, "Person2": 0},
	}
	totalWords := 0
	for _, t := range turns {
		words := len(strings.Fields(t.Text))
		totalWords += words
		a.SpeakerTurnCounts[t.Speaker]++
		a.SpeakerWordCounts[t.Speaker] += words
	}
	a.TotalWords = totalWords
	if a.TurnCount > 0 {
		a.AverageWordsPerTurn = float64(totalWords) / float64(a.TurnCount)
	}
	// ~2.5 words/sec spoken pace
	a.EstimatedDurationSeconds = int(float64(totalWords) / 2.5)
	return a
}
