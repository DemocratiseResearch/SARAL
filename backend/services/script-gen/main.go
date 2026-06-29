package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/pipeline"
	"github.com/saral/script-gen/internal/storage"
	"github.com/saral/script-gen/internal/webhook"
)

// ── Stream constants ──────────────────────────────────────────────────────────

const (
	streamName  = "saral:jobs:script"
	groupName   = "saral-workers"
	dlqStream   = "saral:dlq"
	maxRetries  = 3
	pollBlockMs = 5000
)

// ── Application state ─────────────────────────────────────────────────────────

// app holds all long-lived dependencies initialised once at startup.
type app struct {
	store      *storage.Client
	gemini     *gemini.Clients
	rdb        *goredis.Client
	prompts    config.PromptConfig
	gatewayURL string

	// consumer identity for Redis stream group management
	consumerName string
	currentMsgID string // ID of the message currently being processed (for SIGTERM ACK)
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	// Local dev: load repo-root .env.shared; silently ignored in Docker.
	_ = godotenv.Load("../../.env.shared")
	ctx := context.Background()

	a, err := initApp(ctx)
	if err != nil {
		log.Fatalf("startup failed: %v", err)
	}

	// SIGTERM handler: ACK in-progress message, remove consumer from group
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("[SIGTERM] shutting down, cleaning up consumer")
		if a.currentMsgID != "" {
			_ = a.rdb.XAck(ctx, streamName, groupName, a.currentMsgID).Err()
		}
		_ = a.rdb.XGroupDelConsumer(ctx, streamName, groupName, a.consumerName).Err()
		os.Exit(0)
	}()

	// Reclaim jobs orphaned by a previous crashed instance before accepting new ones
	a.startupSweep(ctx)

	log.Printf("script-gen worker started (consumer=%s), listening on %s", a.consumerName, streamName)
	a.runLoop(ctx)
}

// initApp reads environment variables and initialises all external clients.
func initApp(ctx context.Context) (*app, error) {
	gatewayURL := os.Getenv("GATEWAY_WEBHOOK_URL")
	if gatewayURL == "" {
		gatewayURL = "http://localhost:8080"
	}

	gcpProject := os.Getenv("GCP_PROJECT_ID")

	flashRegion := os.Getenv("GCP_REGION")
	if flashRegion == "" {
		flashRegion = "asia-south1"
	}
	proRegion := os.Getenv("GCP_PRO_REGION")
	if proRegion == "" {
		proRegion = "us-central1"
	}

	llmMode := gemini.LLMMode(strings.ToLower(strings.TrimSpace(os.Getenv("LLM_PROVIDER"))))
	if llmMode == "" {
		llmMode = gemini.ModeVertex
	}

	bucketName := os.Getenv("STORAGE_BUCKET")
	if bucketName == "" {
		bucketName = "saral-artifacts-local"
	}

	promptsPath := "prompts/prompts.json"
	if p := os.Getenv("PROMPTS_PATH"); p != "" {
		promptsPath = p
	}

	prompts, err := config.Load(promptsPath)
	if err != nil {
		return nil, fmt.Errorf("load prompts: %w", err)
	}

	store, err := storage.New(ctx, os.Getenv("STORAGE_EMULATOR_HOST"), bucketName)
	if err != nil {
		return nil, fmt.Errorf("storage client: %w", err)
	}

	geminiClients, err := gemini.NewClients(ctx, gemini.ClientsConfig{
		Mode:                 llmMode,
		GCPProject:           gcpProject,
		FlashRegion:          flashRegion,
		ProRegion:            proRegion,
		GeminiAPIKey:         os.Getenv("GEMINI_API_KEY"),
		OpenRouterAPIKey:     os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterFlashModel: os.Getenv("OPENROUTER_FLASH_MODEL"),
		OpenRouterProModel:   os.Getenv("OPENROUTER_PRO_MODEL"),
		OpenRouterSiteURL:    os.Getenv("OPENROUTER_SITE_URL"),
		OpenRouterSiteName:   os.Getenv("OPENROUTER_SITE_NAME"),
	})
	if err != nil {
		return nil, fmt.Errorf("gemini clients: %w", err)
	}
	log.Printf("[startup] LLM_PROVIDER=%s", llmMode)

	redisOpt, _ := goredis.ParseURL(os.Getenv("REDIS_URL"))
	rdb := goredis.NewClient(redisOpt)

	// Register the GCS client in the poster package (needed by the image filter)
	pipeline.SetPosterStore(store)

	if err := ensureConsumerGroup(ctx, rdb); err != nil {
		return nil, fmt.Errorf("consumer group: %w", err)
	}

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker"
	}

	return &app{
		store:        store,
		gemini:       geminiClients,
		rdb:          rdb,
		prompts:      prompts,
		gatewayURL:   gatewayURL,
		consumerName: fmt.Sprintf("script-gen-%s", hostname),
	}, nil
}

func ensureConsumerGroup(ctx context.Context, rdb *goredis.Client) error {
	err := rdb.XGroupCreateMkStream(ctx, streamName, groupName, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		return fmt.Errorf("XGroupCreateMkStream: %w", err)
	}
	return nil
}

// ── Redis stream loop ─────────────────────────────────────────────────────────

func (a *app) startupSweep(ctx context.Context) {
	log.Println("[startup] XAUTOCLAIM sweep for orphaned messages")
	nextID := "0-0"
	for {
		msgs, nextStartID, err := a.rdb.XAutoClaim(ctx, &goredis.XAutoClaimArgs{
			Stream:   streamName,
			Group:    groupName,
			Consumer: a.consumerName,
			MinIdle:  5 * time.Minute,
			Start:    nextID,
			Count:    10,
		}).Result()
		if err != nil || len(msgs) == 0 {
			break
		}
		log.Printf("[startup] reclaimed %d orphaned messages", len(msgs))
		for _, msg := range msgs {
			a.currentMsgID = msg.ID
			a.dispatch(ctx, msg)
			a.currentMsgID = ""
		}
		nextID = nextStartID
		if nextID == "0-0" {
			break
		}
	}
}

func (a *app) runLoop(ctx context.Context) {
	for {
		streams, err := a.rdb.XReadGroup(ctx, &goredis.XReadGroupArgs{
			Group:    groupName,
			Consumer: a.consumerName,
			Streams:  []string{streamName, ">"},
			Count:    1,
			Block:    time.Duration(pollBlockMs) * time.Millisecond,
		}).Result()
		if err != nil {
			if err == goredis.Nil || strings.Contains(err.Error(), "timeout") {
				continue
			}
			log.Printf("XReadGroup error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		for _, stream := range streams {
			for _, msg := range stream.Messages {
				a.currentMsgID = msg.ID
				a.dispatch(ctx, msg)
				a.currentMsgID = ""
			}
		}
	}
}

// ── Job router ────────────────────────────────────────────────────────────────

// dispatch reads the mode/document_type field and routes the message to the
// correct pipeline function, retrying up to maxRetries times on failure.
// On permanent failure the message is moved to the DLQ.
func (a *app) dispatch(ctx context.Context, msg goredis.XMessage) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic in dispatch: %v", r)
		}
	}()

	f := field(msg.Values)
	runID := f("run_id")
	stepID := f("step_id")
	mode := f("mode")
	documentType := f("document_type") // "patent" | ""
	briefID := f("brief_id")

	log.Printf("[dispatch] run_id=%s step_id=%s mode=%s doc_type=%s", runID, stepID, mode, documentType)

	deps := pipeline.Deps{
		Store:      a.store,
		GatewayURL: a.gatewayURL,
		Prompts:    a.prompts,
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		lastErr = a.runPipeline(ctx, mode, documentType, briefID, f, deps)
		if lastErr == nil {
			a.rdb.XAck(ctx, streamName, groupName, msg.ID)
			return
		}
		log.Printf("[dispatch] attempt %d/%d failed run=%s brief=%s: %v", attempt, maxRetries, runID, briefID, lastErr)
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}

	// Permanent failure — send error webhook and move to DLQ
	stepName := resolveStepName(mode)
	if mode == "business_brief" {
		webhook.SendBusinessBrief(a.gatewayURL, briefID, "failed", "", "", lastErr.Error())
	} else {
		webhook.Send(a.gatewayURL, runID, stepID, stepName, "failed", "", lastErr.Error(), "", "", "")
		a.rdb.XAdd(ctx, &goredis.XAddArgs{
			Stream: dlqStream,
			ID:     "*",
			Values: map[string]interface{}{
				"original_stream": streamName,
				"message_id":      msg.ID,
				"run_id":          runID,
				"step_id":         stepID,
				"error":           lastErr.Error(),
			},
		})
	}
	a.rdb.XAck(ctx, streamName, groupName, msg.ID)
}

// runPipeline selects the correct pipeline based on mode and document_type.
func (a *app) runPipeline(ctx context.Context, mode, documentType, briefID string, f func(string) string, deps pipeline.Deps) error {
	runID := f("run_id")
	stepID := f("step_id")
	audienceLevel := gemini.ResolveAudienceLevel(f("audience_level"))
	tone := gemini.ResolveTone(f("tone"))
	extractedPath := f("extracted_gcs_path")
	userID := f("user_id")
	paperID := f("paper_id")
	title := f("title")
	authors := f("authors")
	date := f("date")
	language := f("language")
	geminiKey := f("gemini_key")

	gc, _, err := a.gemini.ResolveFlash(ctx, geminiKey)
	if err != nil {
		return fmt.Errorf("gemini client: %w", err)
	}

	switch mode {
	case "podcast":
		return pipeline.RunPodcast(ctx, gc, deps,
			runID, stepID, extractedPath, userID, paperID,
			title, authors, language,
			f("host_a_gender"), f("host_b_gender"), f("render_video"), tone,
		)

	case "reel":
		return pipeline.RunReel(ctx, gc, deps,
			runID, stepID, extractedPath, userID, paperID,
			title, authors, language, tone,
		)

	case "slides_deck":
		return pipeline.RunSlidesDeck(ctx, gc, deps, runID, stepID, extractedPath, userID, paperID)

	case "poster":
		return pipeline.RunPoster(ctx, gc, deps, runID, stepID, extractedPath, userID, paperID)

	case "metadata_extract":
		return pipeline.RunMetadataExtract(ctx, gc, deps, runID, stepID, extractedPath, userID, paperID)

	case "linkedin_draft":
		return pipeline.RunLinkedIn(ctx, gc, deps, runID, stepID, extractedPath, userID, paperID)

	case "twitter_draft":
		return pipeline.RunTwitter(ctx, gc, deps, runID, stepID, extractedPath, userID, paperID)

	case "business_brief":
		gcPro, _, err := a.gemini.ResolvePro(ctx, geminiKey)
		if err != nil {
			return fmt.Errorf("gemini pro client: %w", err)
		}
		return pipeline.RunBusinessBrief(ctx, gcPro, deps, briefID, f("text_path"), userID, paperID)

	default:
		if documentType == "patent" {
			return pipeline.RunPatent(ctx, gc, deps,
				runID, stepID, audienceLevel, tone, extractedPath, userID, paperID,
			)
		}
		return pipeline.RunScript(ctx, gc, deps,
			runID, stepID, audienceLevel, tone, extractedPath, userID, paperID,
			title, authors, date,
		)
	}
}

// ── Utility ───────────────────────────────────────────────────────────────────

// field returns a closure that reads string values from a Redis message Values map.
func field(values map[string]any) func(string) string {
	return func(key string) string {
		if v, ok := values[key]; ok {
			return fmt.Sprintf("%v", v)
		}
		return ""
	}
}

// resolveStepName maps a mode string to the step_name used in error webhooks.
func resolveStepName(mode string) string {
	switch mode {
	case "podcast":
		return "podcast_script_gen"
	case "reel":
		return "reel_script_gen"
	case "metadata_extract":
		return "metadata_extract"
	case "linkedin_draft":
		return "linkedin_draft"
	case "twitter_draft":
		return "twitter_draft"
	default:
		return "script_gen"
	}
}
