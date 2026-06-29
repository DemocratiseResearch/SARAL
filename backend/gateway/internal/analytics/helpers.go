

package analytics

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

// ── Collection names ──────────────────────────────────────────────────────────

const (
	CollPaperMetadata     = "paper_metadata"
	CollUserActivity      = "user_activity_summary"
	CollPaperPipeline     = "paper_pipeline"
)

// ── Pipeline stage ordering ───────────────────────────────────────────────────

// pipelineStageOrder defines the canonical ordering for the video pipeline.
// Other pipeline modes (podcast, reel, poster, slides) append their steps
// dynamically via orderedPipelineSteps.
var pipelineStageOrder = []string{
	"uploaded",
	"pdf_extract",
	"metadata_extract",
	"script_gen",
	"beamer_compile",
	"audio_gen",
	"ffmpeg_stitch",
}

// defaultETASeconds provides fallback ETA estimates (seconds) for each pipeline step.
var defaultETASeconds = map[string]float64{
	"uploaded":          5,
	"pdf_extract":       30,
	"metadata_extract":  15,
	"script_gen":        75,
	"beamer_compile":    90,
	"audio_gen":         120,
	"ffmpeg_stitch":     60,
	// podcast steps
	"podcast_script_gen": 60,
	"podcast_audio_gen":  120,
	// reel steps
	"reel_script_gen":  60,
	"reel_audio_gen":   120,
	"reel_video_gen":   120,
	// poster steps
	"poster_compile": 90,
	// social / brief
	"business_brief": 30,
	"linkedin_draft":  20,
	"twitter_draft":   20,
}

// ── Generic map helpers ───────────────────────────────────────────────────────

// toMap merges snapshot data plus the document ID into a Go map.
func toMap(snap *firestore.DocumentSnapshot) map[string]interface{} {
	if snap == nil || !snap.Exists() {
		return nil
	}
	m := snap.Data()
	m["id"] = snap.Ref.ID
	return m
}

// ── paper_metadata ────────────────────────────────────────────────────────────

// SavePaperMetadata upserts a paper_metadata document (merge = true).
func SavePaperMetadata(ctx context.Context, paperID string, data map[string]interface{}) bool {
	if fsClient == nil {
		log.Printf("analytics.SavePaperMetadata: Firestore client is nil — skipping")
		return false
	}
	if _, ok := data["created_at"]; !ok {
		data["created_at"] = time.Now()
	}
	data["updated_at"] = time.Now()
	_, err := fsClient.Collection(CollPaperMetadata).Doc(paperID).Set(ctx, data, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.SavePaperMetadata(%s): %v", paperID, err)
		return false
	}
	return true
}

// GetPaperMetadata returns the paper_metadata document for paperID or nil.
func GetPaperMetadata(ctx context.Context, paperID string) map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	snap, err := fsClient.Collection(CollPaperMetadata).Doc(paperID).Get(ctx)
	if err != nil {
		log.Printf("analytics.GetPaperMetadata(%s): %v", paperID, err)
		return nil
	}
	return toMap(snap)
}

// UpdatePaperOutput writes processing_outputs.<outputType> inside a paper doc.
func UpdatePaperOutput(ctx context.Context, paperID, outputType string, data map[string]interface{}) bool {
	if fsClient == nil {
		return false
	}
	data["generated_at"] = time.Now()
	payload := map[string]interface{}{
		"processing_outputs": map[string]interface{}{
			outputType: data,
		},
		"updated_at": time.Now(),
	}
	_, err := fsClient.Collection(CollPaperMetadata).Doc(paperID).Set(ctx, payload, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.UpdatePaperOutput(%s, %s): %v", paperID, outputType, err)
		return false
	}
	return true
}

// GetPapersByUser returns all paper_metadata documents for a given user_id,
// sorted newest-first in Go (avoids a composite Firestore index requirement).
func GetPapersByUser(ctx context.Context, userID string, limit int) []map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	if limit <= 0 {
		limit = 100
	}
	iter := fsClient.Collection(CollPaperMetadata).
		Where("user_id", "==", userID).
		Limit(limit).
		Documents(ctx)
	defer iter.Stop()

	var papers []map[string]interface{}
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("analytics.GetPapersByUser(%s): %v", userID, err)
			break
		}
		papers = append(papers, toMap(snap))
	}

	// Sort newest-first by created_at
	sort.Slice(papers, func(i, j int) bool {
		ti, _ := papers[i]["created_at"].(time.Time)
		tj, _ := papers[j]["created_at"].(time.Time)
		return ti.After(tj)
	})
	return papers
}

// GetRecentPapers returns the most recently uploaded papers across all users.
func GetRecentPapers(ctx context.Context, limit int) []map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	if limit <= 0 {
		limit = 50
	}
	iter := fsClient.Collection(CollPaperMetadata).
		OrderBy("created_at", firestore.Desc).
		Limit(limit).
		Documents(ctx)
	defer iter.Stop()

	var papers []map[string]interface{}
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("analytics.GetRecentPapers: %v", err)
			break
		}
		papers = append(papers, toMap(snap))
	}
	return papers
}

// GetStorageBreakdown aggregates size_bytes from processing_outputs across all papers.
func GetStorageBreakdown(ctx context.Context) map[string]int64 {
	breakdown := map[string]int64{
		"videos":          0,
		"podcasts":        0,
		"reels":           0,
		"posters":         0,
		"slides":          0,
		"pdfs":            0,
		"business_briefs": 0,
		"other":           0,
	}
	if fsClient == nil {
		return breakdown
	}

	iter := fsClient.Collection(CollPaperMetadata).Documents(ctx)
	defer iter.Stop()

	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("analytics.GetStorageBreakdown: %v", err)
			break
		}
		data := snap.Data()
		outputs, _ := data["processing_outputs"].(map[string]interface{})
		for outType, outRaw := range outputs {
			outData, ok := outRaw.(map[string]interface{})
			if !ok {
				continue
			}
			sz := int64AsInt64(outData["size_bytes"])
			if _, known := breakdown[outType]; known {
				breakdown[outType] += sz
			} else {
				breakdown["other"] += sz
			}
		}
	}
	return breakdown
}

// ── user_activity_summary ─────────────────────────────────────────────────────

// GetUserActivity returns the user_activity_summary document or nil.
func GetUserActivity(ctx context.Context, userID string) map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	snap, err := fsClient.Collection(CollUserActivity).Doc(userID).Get(ctx)
	if err != nil {
		log.Printf("analytics.GetUserActivity(%s): %v", userID, err)
		return nil
	}
	return toMap(snap)
}

// IncrementUserCounter atomically increments a named counter in user_activity_summary.
func IncrementUserCounter(ctx context.Context, userID, counterName string, amount int64) bool {
	if fsClient == nil {
		return false
	}
	_, err := fsClient.Collection(CollUserActivity).Doc(userID).Set(ctx,
		map[string]interface{}{
			counterName:     firestore.Increment(amount),
			"last_activity": time.Now(),
		},
		firestore.MergeAll,
	)
	if err != nil {
		log.Printf("analytics.IncrementUserCounter(%s, %s): %v", userID, counterName, err)
		return false
	}
	return true
}

// UpdateUserActivity merges arbitrary activity data (e.g. email) into the
// user_activity_summary document.
func UpdateUserActivity(ctx context.Context, userID string, data map[string]interface{}) bool {
	if fsClient == nil {
		return false
	}
	data["last_activity"] = time.Now()

	snap, err := fsClient.Collection(CollUserActivity).Doc(userID).Get(ctx)
	if err != nil || !snap.Exists() {
		data["first_activity"] = time.Now()
	}

	_, err = fsClient.Collection(CollUserActivity).Doc(userID).Set(ctx, data, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.UpdateUserActivity(%s): %v", userID, err)
		return false
	}
	return true
}

// ── paper_pipeline ────────────────────────────────────────────────────────────

// pipelineRunRef returns the Firestore reference for a specific pipeline run document.
// Path: paper_pipeline/{paperID}/runs/{runID}
func pipelineRunRef(paperID, runID string) *firestore.DocumentRef {
	return fsClient.Collection(CollPaperPipeline).Doc(paperID).Collection("runs").Doc(runID)
}

// InitPipelineTracking creates or refreshes the pipeline run tracking document.
// Path: paper_pipeline/{paperID}/runs/{runID}
//
// It also writes a lightweight stub to the parent paper_pipeline/{paperID} document so
// that it appears as a real (non-phantom) document in the Firebase Console.
func InitPipelineTracking(ctx context.Context, runID, paperID, userID, runMode string) bool {
	if fsClient == nil {
		log.Printf("analytics.InitPipelineTracking: Firestore client is nil — skipping (check FIREBASE_CREDENTIALS_FILE / FIREBASE_PROJECT_ID)")
		return false
	}
	log.Printf("analytics.InitPipelineTracking: writing run=%s paper=%s mode=%s", runID, paperID, runMode)

	ref := pipelineRunRef(paperID, runID)
	snap, _ := ref.Get(ctx)
	now := time.Now()

	payload := map[string]interface{}{
		"run_id":   runID,
		"paper_id": paperID,
		"run_mode": runMode,
		"updated_at": now,
		"stages": map[string]interface{}{
			"uploaded": map[string]interface{}{
				"status":       "completed",
				"completed_at": now,
			},
		},
		"current_stage":         "uploaded",
		"last_successful_stage": "uploaded",
	}
	if snap == nil || !snap.Exists() {
		payload["created_at"] = now
		if userID != "" {
			payload["user_id"] = userID
		}
	}

	_, err := ref.Set(ctx, payload, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.InitPipelineTracking(%s/%s): WRITE FAILED: %v", paperID, runID, err)
		return false
	}
	log.Printf("analytics.InitPipelineTracking: OK — paper_pipeline/%s/runs/%s", paperID, runID)

	// Write a stub to the parent document so it shows up as a real document
	// (not a gray phantom) in the Firebase Console.
	parentPayload := map[string]interface{}{
		"paper_id":   paperID,
		"updated_at": now,
	}
	if snap == nil || !snap.Exists() {
		parentPayload["created_at"] = now
	}
	if _, err := fsClient.Collection(CollPaperPipeline).Doc(paperID).Set(ctx, parentPayload, firestore.MergeAll); err != nil {
		log.Printf("analytics.InitPipelineTracking: parent stub write failed (non-fatal): %v", err)
	}
	return true
}

// UpdatePipelineStep records a stage result inside the pipeline run document.
func UpdatePipelineStep(ctx context.Context, runID, paperID, step string, metadata map[string]interface{}, startedAt *time.Time, status string) bool {
	if fsClient == nil {
		log.Printf("analytics.UpdatePipelineStep: Firestore client is nil — skipping")
		return false
	}
	log.Printf("analytics.UpdatePipelineStep: run=%s paper=%s step=%s status=%s", runID, paperID, step, status)
	now := time.Now()

	stepData := map[string]interface{}{
		"status":       status,
		"completed_at": now,
	}
	if startedAt != nil {
		stepData["started_at"] = *startedAt
		elapsed := now.Sub(*startedAt).Seconds()
		if elapsed < 0 {
			elapsed = 0
		}
		stepData["duration_seconds"] = elapsed
	}
	for k, v := range metadata {
		stepData[k] = v
	}

	updates := map[string]interface{}{
		"stages." + step: stepData,
		"updated_at":     now,
	}
	if status == "completed" {
		updates["last_successful_stage"] = step
	}
	if status != "failed" {
		updates["current_stage"] = step
	}

	_, err := pipelineRunRef(paperID, runID).Set(ctx, updates, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.UpdatePipelineStep(%s/%s, %s): WRITE FAILED: %v", paperID, runID, step, err)
		return false
	}
	log.Printf("analytics.UpdatePipelineStep: OK — paper_pipeline/%s/runs/%s step=%s", paperID, runID, step)
	return true
}

// MarkPipelineFailed records a failure in the pipeline run document including an error code.
func MarkPipelineFailed(ctx context.Context, runID, paperID, step, errMsg, errCode string, startedAt *time.Time) bool {
	if fsClient == nil {
		log.Printf("analytics.MarkPipelineFailed: Firestore client is nil — skipping")
		return false
	}
	log.Printf("analytics.MarkPipelineFailed: run=%s paper=%s step=%s code=%s", runID, paperID, step, errCode)
	now := time.Now()

	stepData := map[string]interface{}{
		"status":           "failed",
		"completed_at":     now,
		"error_message":    errMsg,
		"error_root_cause": extractRootCause(errMsg),
	}
	if startedAt != nil {
		stepData["started_at"] = *startedAt
		elapsed := now.Sub(*startedAt).Seconds()
		if elapsed < 0 {
			elapsed = 0
		}
		stepData["duration_seconds"] = elapsed
	}

	payload := map[string]interface{}{
		"stages." + step: stepData,
		"updated_at":     now,
		"current_stage":  step + "_failed",
		"error_code":     errCode,
	}

	_, err := pipelineRunRef(paperID, runID).Set(ctx, payload, firestore.MergeAll)
	if err != nil {
		log.Printf("analytics.MarkPipelineFailed(%s/%s, %s): WRITE FAILED: %v", paperID, runID, step, err)
		return false
	}
	log.Printf("analytics.MarkPipelineFailed: OK — paper_pipeline/%s/runs/%s step=%s", paperID, runID, step)
	return true
}

// GetPipelineStatus returns a pipeline progress snapshot for a specific run.
func GetPipelineStatus(ctx context.Context, runID, paperID string) map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	snap, err := pipelineRunRef(paperID, runID).Get(ctx)
	if err != nil || !snap.Exists() {
		return nil
	}
	return processPipelineSnap(runID, snap.Data())
}

// GetPipelinesByPaper returns all pipeline run snapshots for a paper, newest first.
func GetPipelinesByPaper(ctx context.Context, paperID string) []map[string]interface{} {
	if fsClient == nil {
		return nil
	}
	iter := fsClient.Collection(CollPaperPipeline).Doc(paperID).
		Collection("runs").
		OrderBy("created_at", firestore.Desc).
		Documents(ctx)
	defer iter.Stop()
	var runs []map[string]interface{}
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("analytics.GetPipelinesByPaper(%s): %v", paperID, err)
			break
		}
		if result := processPipelineSnap(snap.Ref.ID, snap.Data()); result != nil {
			runs = append(runs, result)
		}
	}
	return runs
}

// processPipelineSnap converts raw Firestore pipeline run data into the
// structured status snapshot returned by the REST API.
func processPipelineSnap(runID string, data map[string]interface{}) map[string]interface{} {
	// ── Reconstruct ordered stage list with status/ETA ────────────────────────
	stages, _ := data["stages"].(map[string]interface{})
	if stages == nil {
		stages = map[string]interface{}{}
	}
	currentStage, _ := data["current_stage"].(string)
	lastSuccessful, _ := data["last_successful_stage"].(string)

	orderedSteps := orderedPipelineSteps(stages, currentStage, lastSuccessful)

	// Compute average duration from completed steps
	var totalDur float64
	completedCount := 0
	for _, step := range orderedSteps {
		sd, ok := stages[step].(map[string]interface{})
		if !ok {
			continue
		}
		if sd["status"] == "completed" {
			if d, ok := sd["duration_seconds"].(float64); ok && d > 0 {
				totalDur += d
				completedCount++
			}
		}
	}
	var avgDur *float64
	if completedCount > 0 {
		v := totalDur / float64(completedCount)
		avgDur = &v
	}

	completedSteps, totalSteps := 0, len(orderedSteps)
	var activeStep string
	var etaSeconds float64
	var stageList []map[string]interface{}

	for _, step := range orderedSteps {
		sd, _ := stages[step].(map[string]interface{})
		if sd == nil {
			sd = map[string]interface{}{}
		}
		st := inferStepStatus(step, sd, currentStage, lastSuccessful)
		if st == "completed" {
			completedSteps++
		}
		if st == "in_progress" {
			activeStep = step
		}
		if st == "pending" || st == "in_progress" {
			etaSeconds += estimateStageSeconds(step, sd, avgDur)
		}
		stageList = append(stageList, map[string]interface{}{
			"step":             step,
			"status":           st,
			"duration_seconds": sd["duration_seconds"],
			"started_at":       sd["started_at"],
			"completed_at":     sd["completed_at"],
			"error_message":    sd["error_message"],
			"error_root_cause": sd["error_root_cause"],
		})
	}

	progressPct := 0.0
	if totalSteps > 0 {
		progressPct = float64(completedSteps) / float64(totalSteps) * 100
	}

	return map[string]interface{}{
		"run_id":                runID,
		"paper_id":              data["paper_id"],
		"run_mode":              data["run_mode"],
		"current_stage":         currentStage,
		"last_successful_stage": lastSuccessful,
		"stages":                stageList,
		"completed_steps":       completedSteps,
		"total_steps":           totalSteps,
		"progress_percentage":   progressPct,
		"active_step":           activeStep,
		"eta_seconds":           etaSeconds,
		"error_code":            data["error_code"],
		"created_at":            data["created_at"],
		"updated_at":            data["updated_at"],
	}
}

// ── private helpers ───────────────────────────────────────────────────────────

// orderedPipelineSteps returns an ordered slice of all stage names.
func orderedPipelineSteps(stages map[string]interface{}, currentStage, lastSuccessful string) []string {
	known := make([]string, len(pipelineStageOrder))
	copy(known, pipelineStageOrder)

	// Ensure current and last-successful appear in the list
	normCurrent := strings.TrimSuffix(currentStage, "_failed")
	for _, extra := range []string{normCurrent, lastSuccessful} {
		if extra == "" {
			continue
		}
		found := false
		for _, k := range known {
			if k == extra {
				found = true
				break
			}
		}
		if !found {
			known = append(known, extra)
		}
	}

	// Append dynamic stages (e.g. reel_*, podcast_*) alphabetically
	for step := range stages {
		found := false
		for _, k := range known {
			if k == step {
				found = true
				break
			}
		}
		if !found {
			known = append(known, step)
		}
	}
	return known
}

// inferStepStatus mirrors _infer_step_status from Python.
func inferStepStatus(step string, stepData map[string]interface{}, currentStage, lastSuccessful string) string {
	if explicit, ok := stepData["status"].(string); ok {
		switch explicit {
		case "pending", "in_progress", "completed", "failed":
			return explicit
		}
	}
	if step == "uploaded" {
		return "completed"
	}
	failedStep := strings.TrimSuffix(currentStage, "_failed")
	if strings.HasSuffix(currentStage, "_failed") && failedStep == step {
		return "failed"
	}
	if currentStage == step {
		return "in_progress"
	}

	// Determine position relative to last_successful_stage
	stagePos := func(name string) int {
		for i, s := range pipelineStageOrder {
			if s == name {
				return i
			}
		}
		return -1
	}
	stepPos := stagePos(step)
	lastPos := stagePos(lastSuccessful)
	if stepPos != -1 && lastPos != -1 {
		if stepPos <= lastPos {
			return "completed"
		}
		return "pending"
	}
	return "pending"
}

// estimateStageSeconds mirrors _estimate_stage_seconds.
func estimateStageSeconds(step string, stepData map[string]interface{}, avgCompleted *float64) float64 {
	if d, ok := stepData["duration_seconds"].(float64); ok && d > 0 {
		return d
	}
	if avgCompleted != nil && *avgCompleted > 0 {
		return *avgCompleted
	}
	if def, ok := defaultETASeconds[step]; ok {
		return def
	}
	return 60
}

// extractRootCause mirrors _extract_root_cause from Python.
func extractRootCause(msg string) string {
	lower := strings.ToLower(msg)

	patterns := []struct {
		keywords []string
		label    string
	}{
		{[]string{"quota", "resource_exhausted", "rate limit", "ratelimit", "too many requests"}, "API quota / rate-limit exceeded"},
		{[]string{"api key", "apikey", "api_key", "invalid_api_key", "invalid api key"}, "API key missing or invalid"},
		{[]string{"gemini"}, "Gemini API failure"},
		{[]string{"sarvam"}, "Sarvam TTS failure"},
		{[]string{"bhashini", "mt_bhashini"}, "Bhashini TTS/translation failure"},
		{[]string{"latex", "pdflatex", "xelatex", "compile"}, "LaTeX compilation failure"},
		{[]string{"timeout", "timed out", "deadline"}, "External service timeout"},
		{[]string{"connection", "connectionerror", "connection refused", "network"}, "Network / connection failure"},
		{[]string{"permission", "unauthorized", "403", "401"}, "Authentication / permission failure"},
		{[]string{"not found", "404"}, "Resource not found"},
		{[]string{"memory", "out of memory", "oom"}, "Out-of-memory error"},
	}
	for _, p := range patterns {
		for _, kw := range p.keywords {
			if strings.Contains(lower, kw) {
				return p.label
			}
		}
	}
	// Fall back to first non-empty line
	for _, line := range strings.Split(msg, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			if len(line) > 200 {
				line = line[:200]
			}
			return line
		}
	}
	return "Unknown error"
}

// int64AsInt64 safely converts an interface{} to int64.
func int64AsInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case int32:
		return int64(x)
	}
	return 0
}
