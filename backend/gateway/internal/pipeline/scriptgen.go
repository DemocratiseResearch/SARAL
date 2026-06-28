package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

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

// languageNames maps human-readable display names (case-insensitive) to BCP-47 codes.
var languageNames = map[string]string{
	"english":   "en-IN",
	"hindi":     "hi-IN",
	"bengali":   "bn-IN",
	"tamil":     "ta-IN",
	"telugu":    "te-IN",
	"kannada":   "kn-IN",
	"malayalam": "ml-IN",
	"marathi":   "mr-IN",
	"gujarati":  "gu-IN",
	"punjabi":   "pa-IN",
	"panjabi":   "pa-IN",
	"odia":      "od-IN",
}

// normalizeLanguage converts a display name ("Hindi") or BCP-47 code ("hi-IN") to
// a canonical BCP-47 code
func normalizeLanguage(s string) string {
	if s == "" {
		return s
	}
	if code, ok := languageNames[strings.ToLower(s)]; ok {
		return code
	}
	return s // already a BCP-47 code or unknown — pass through
}


func mergeStoredScriptJSONByRun(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, patch map[string]interface{}) {
	if len(patch) == 0 {
		return
	}
	gcsPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
	if err != nil {
		return
	}
	_ = patchStoredScriptJSON(ctx, gcsPath, patch)
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

func ScriptHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		gcsPath, err := db.GetStepOutput(c.Request.Context(), pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "script not generated yet")
			return
		}

		data, err := storage.DownloadJSON(c.Request.Context(), gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}

		var script any
		if err := json.Unmarshal(data, &script); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}

		apiresp.OK(c, script)
	}
}

// UpdateScriptHandler allows the user to edit the generated script.

func UpdateScriptHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		// Parse the edited script from request body
		var script models.Script
		if err := c.ShouldBindJSON(&script); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_script_json", "invalid script JSON: "+err.Error())
			return
		}
		script.RunID = runID.String()
		script.Language = normalizeLanguage(script.Language)

		// Get the existing GCS path so we overwrite in the same location
		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "no script to update — generate one first")
			return
		}

		// Upload the edited script, overwriting the old one
		scriptBytes, _ := json.Marshal(script)
		key := storage.ExtractKey(gcsPath)
		if _, err := storage.UploadBytes(ctx, scriptBytes, key, "application/json"); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_save_failed", "failed to save edited script")
			return
		}

		apiresp.OK(c, gin.H{"message": "script updated"})
	}
}

func ContinueAfterScriptHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		// Parse optional output format options from request body
		var req struct {
			OutputFormat  string `json:"output_format"`
			PPTTemplate   string `json:"ppt_template"`
			VoiceGender   string `json:"voice_gender"`   // "male" | "female"
			Language      string `json:"language"`       // BCP-47 e.g. "en-IN", "hi-IN" — controls audio TTS
			SlideLanguage string `json:"slide_language"` // BCP-47 for slides; defaults to req.Language
		}
		_ = c.ShouldBindJSON(&req) // body is optional
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


		patch := map[string]interface{}{}
		if req.VoiceGender != "" || req.Language != "" || req.SlideLanguage != "" {
			if existingPath, pErr := db.GetStepOutput(ctx, pool, runID, "script_gen"); pErr == nil {
				if rawScript, dErr := storage.DownloadJSON(ctx, existingPath); dErr == nil {
					var scriptMap map[string]interface{}
					if uErr := json.Unmarshal(rawScript, &scriptMap); uErr == nil {
						if req.VoiceGender != "" {
							scriptMap["voice_gender"] = req.VoiceGender
						}
						if req.Language != "" {
							scriptMap["language"] = req.Language
						}
						if req.SlideLanguage != "" {
							scriptMap["slide_language"] = req.SlideLanguage
						}
						if updated, mErr := json.Marshal(scriptMap); mErr == nil {
							key := storage.ExtractKey(existingPath)
							_, _ = storage.UploadBytes(ctx, updated, key, "application/json")
						}
					}
				}
			}
		}
		if req.Language != "" {
			patch["language"] = req.Language
		}
		mergeStoredScriptJSONByRun(ctx, pool, runID, patch)

		// Verify prerequisites exist
		scriptPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "script_not_ready", "script not ready")
			return
		}
		extractedPath, err := db.GetExtractedJSONPathForRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "extraction_not_ready", "extracted document not ready")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
			return
		}

		// Fetch user keys so workers can prefer them over shared env-var keys.
		_, userSarvamKey, _ := db.GetUserKeys(ctx, pool, run.UserID)

		// Create both parallel step rows
		beamerStepID, err := db.CreateStep(ctx, pool, runID, "beamer_compile")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error creating beamer step")
			return
		}
		audioStepID, err := db.CreateStep(ctx, pool, runID, "audio_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error creating audio step")
			return
		}

		db.UpdateRunCurrentStep(ctx, pool, runID, "beamer_compile", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      beamerStepID.String(),
			Step:    "beamer_compile",
			Status:  "processing",
			Message: "Starting LaTeX compilation",
		})
		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      audioStepID.String(),
			Step:    "audio_gen",
			Status:  "processing",
			Message: "Starting audio generation",
		})

		// Enqueue beamer_compile
		if err := enqueueBeamerCompile(ctx, rdb, runID, beamerStepID, run, scriptPath, extractedPath, BeamerJobOpts{
			OutputFormat: req.OutputFormat,
			PPTTemplate:  req.PPTTemplate,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue beamer_compile job")
			return
		}

		// Enqueue audio_gen
		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamAudio, redisx.JobData{
			"run_id":          runID.String(),
			"step_id":         audioStepID.String(),
			"paper_id":        run.PaperID.String(),
			"user_id":         run.UserID.String(),
			"script_gcs_path": scriptPath,
			"sarvam_key":      userSarvamKey,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue audio_gen job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"message":    "beamer_compile and audio_gen started in parallel",
			"next_steps": []string{"beamer_compile", "audio_gen"},
		})
	}
}


func ImageAssignHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		var req struct {
			Assignments map[string]int `json:"assignments"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.Assignments) == 0 {
			apiresp.Error(c, http.StatusBadRequest, "invalid_body", `body must be {"assignments": {"section_id": image_index}}`)
			return
		}

		// Resolve image indices → GCS paths from extracted.json
		extractedPath, err := db.GetExtractedJSONPathForRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "extraction_not_ready", "extraction not ready")
			return
		}
		extractedData, err := storage.DownloadJSON(ctx, extractedPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_fetch_failed", "failed to fetch extracted data")
			return
		}
		var extracted struct {
			ImagePaths []string `json:"image_paths"`
		}
		if err := json.Unmarshal(extractedData, &extracted); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_decode_failed", "failed to decode extracted data")
			return
		}

		// Validate indices and build GCS assignment map
		imageAssignments := make(map[string]string, len(req.Assignments))
		for sectionID, imgIdx := range req.Assignments {
			if imgIdx < 0 || imgIdx >= len(extracted.ImagePaths) {
				apiresp.Error(c, http.StatusBadRequest, "invalid_image_index",
					fmt.Sprintf("image index %d out of range (0–%d)", imgIdx, len(extracted.ImagePaths)-1))
				return
			}
			imageAssignments[sectionID] = extracted.ImagePaths[imgIdx]
		}

		// Patch script JSON — merge with existing assignments
		scriptPath, err := db.GetStepOutput(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "script_not_ready", "no script to update — generate one first")
			return
		}
		scriptData, err := storage.DownloadJSON(ctx, scriptPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_fetch_failed", "failed to fetch script")
			return
		}
		var scriptMap map[string]interface{}
		if err := json.Unmarshal(scriptData, &scriptMap); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_decode_failed", "failed to decode script")
			return
		}

		// Merge (don't wipe unmentioned sections)
		existing, _ := scriptMap["image_assignments"].(map[string]interface{})
		if existing == nil {
			existing = make(map[string]interface{})
		}
		for k, v := range imageAssignments {
			existing[k] = v
		}
		scriptMap["image_assignments"] = existing

		updated, _ := json.Marshal(scriptMap)
		key := storage.ExtractKey(scriptPath)
		if _, err := storage.UploadBytes(ctx, updated, key, "application/json"); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "script_save_failed", "failed to save script")
			return
		}

		apiresp.OK(c, gin.H{
			"message":           "image assignments saved",
			"image_assignments": imageAssignments,
		})
	}
}


type generateVideoReq struct {
	AudienceLevel string `json:"audience_level"`
	Tone          string `json:"tone"`
	ForceNew bool `json:"force_new"`
}

func resolveAudience(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "novice":
		return "novice"
	case "expert":
		return "expert"
	default:
		return "intermediate"
	}
}

func resolveTone(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "conversational":
		return "conversational"
	default:
		return "formal"
	}
}

func GenerateVideoHandler(pool *pgxpool.Pool, rdb *goredis.Client, sseMgr *sse.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		sourceRunID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		var req generateVideoReq
		_ = c.ShouldBindJSON(&req) // tolerant: zero values → defaults below
		audience := resolveAudience(req.AudienceLevel)
		tone := resolveTone(req.Tone)

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

		sourceRun, err := db.FindGenerateVideoSourceRun(ctx, pool, sourceRunID, userID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "run_not_found", "run not found")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "run_lookup_failed", "failed to load run")
			return
		}

		// 1. Dedupe: is there already a non-failed video run for this
		var runID uuid.UUID
		var scriptStatus string
		var findErr error
		if !req.ForceNew {
			runID, scriptStatus, findErr = db.FindReusableVideoRun(ctx, pool, sourceRun.PaperID, audience)
		} else {
			findErr = errors.New("force_new")
		}
		hasExistingRun := findErr == nil
		needScriptGen := !hasExistingRun || scriptStatus == "" || scriptStatus == "failed"

		// 2. If nothing reusable, create a fresh pipeline_run for this audience.
		if !hasExistingRun {
			runID, err = db.CreatePipelineRun(ctx, pool, sourceRun.PaperID, sourceRun.UserID, "video")
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "run_create_failed", "db error creating new run")
				return
			}
			if err := db.SetRunAudienceTone(ctx, pool, runID, audience, tone); err != nil {
				log.Printf("SetRunAudienceTone error (non-fatal): %v", err)
			}
		}

		// 3. If script_gen is already done or in flight on the reused run,
		//    return its runID and let the client handle from there.
		if !needScriptGen {
			apiresp.Accepted(c, gin.H{
				"run_id":         runID.String(),
				"source_run_id":  sourceRunID.String(),
				"step":           "script_gen",
				"audience_level": audience,
				"tone":           tone,
				"reused":         true,
				"completed":      scriptStatus == "completed",
			})
			return
		}

		// 4. We need to enqueue script_gen on this runID (either a brand-new
		//    run, or the upload run we just claimed for this audience).
		extractedPath, err := db.GetLatestStepOutputForPaper(ctx, pool, sourceRun.PaperID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "extraction_not_ready", "pdf extraction not complete for this paper")
			return
		}

		geminiKey, sarvamKey, _ := db.GetUserKeys(ctx, pool, sourceRun.UserID)

		stepID, err := db.CreateStep(ctx, pool, runID, "script_gen")
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "step_create_failed", "db error")
			return
		}
		db.UpdateRunCurrentStep(ctx, pool, runID, "script_gen", "processing")

		sseMgr.PublishEvent(ctx, runID, models.SSEEvent{
			ID:      stepID.String(),
			Step:    "script_gen",
			Status:  "processing",
			Message: "Generating presentation script...",
		})

		if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamScript, redisx.JobData{
			"run_id":             runID.String(),
			"step_id":            stepID.String(),
			"paper_id":           sourceRun.PaperID.String(),
			"user_id":            sourceRun.UserID.String(),
			"extracted_gcs_path": extractedPath,
			"gemini_key":         geminiKey,
			"sarvam_key":         sarvamKey,
			"mode":               "video",
			"audience_level":     audience,
			"tone":               tone,
		}); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "job_enqueue_failed", "failed to enqueue script_gen job")
			return
		}

		apiresp.Accepted(c, gin.H{
			"run_id":         runID.String(),
			"source_run_id":  sourceRunID.String(),
			"step":           "script_gen",
			"audience_level": audience,
			"tone":           tone,
			"reused":         hasExistingRun, // true only when we claimed the upload run
			"completed":      false,
		})
	}
}
