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

	gcs "cloud.google.com/go/storage"
	"github.com/joho/godotenv"
	goredis "github.com/redis/go-redis/v9"
	"google.golang.org/api/option"

	"github.com/saral/audio-gen/bhashini"
	"github.com/saral/audio-gen/gemini"
	"github.com/saral/audio-gen/sarvam"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	streamName           = "saral:jobs:audio"
	groupName            = "saral-workers"
	dlqStream            = "saral:dlq"
	pollBlockMs          = 5000
	maxRetries           = 3
	maxChunkRune         = 500
	bhashiniMaxChunkRune = 200
	maxConcurrent        = 8
)

// ── Models ────────────────────────────────────────────────────────────────────

type Section struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Narration string   `json:"narration"`
	Bullets   []string `json:"bullets"`
}

type Script struct {
	RunID       string    `json:"run_id"`
	Language    string    `json:"language,omitempty"`
	VoiceGender string    `json:"voice_gender,omitempty"`
	Sections    []Section `json:"sections"`
	TitleIntro  string    `json:"title_intro,omitempty"`
}

type AudioSlide struct {
	FrameIndex int      `json:"frame_index"`
	Text       string   `json:"text,omitempty"`
	AudioPaths []string `json:"audio_paths"`
}

type AudioManifest struct {
	RunID  string       `json:"run_id"`
	Slides []AudioSlide `json:"slides"`
}

type WorkerUpdate struct {
	RunID         string `json:"run_id"`
	StepID        string `json:"step_id"`
	StepName      string `json:"step_name"`
	Status        string `json:"status"`
	GCSOutputPath string `json:"gcs_output_path,omitempty"`
	ErrorMessage  string `json:"error_message,omitempty"`
	NextStep      string `json:"next_step"`
}

type PodcastScript struct {
	RunID       string          `json:"run_id"`
	Title       string          `json:"title"`
	Language    string          `json:"language"`
	RenderVideo *bool           `json:"render_video,omitempty"`
	Speakers    PodcastSpeakers `json:"speakers,omitempty"`
	Turns       []PodcastTurn   `json:"turns"`
}

type PodcastTurn struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

type PodcastSpeakerConfig struct {
	Gender string `json:"gender,omitempty"`
	Voice  string `json:"voice,omitempty"`
}

type PodcastSpeakers struct {
	HostA PodcastSpeakerConfig `json:"host_a,omitempty"`
	HostB PodcastSpeakerConfig `json:"host_b,omitempty"`
}

type ReelTurn struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

type ReelAvatarSelection struct {
	Pair    string `json:"pair"`
	Person1 string `json:"person1"`
	Person2 string `json:"person2"`
}

type ReelScript struct {
	RunID    string               `json:"run_id"`
	Title    string               `json:"title"`
	Language string               `json:"language"`
	Avatars  *ReelAvatarSelection `json:"avatars,omitempty"`
	Turns    []ReelTurn           `json:"turns"`
}

type ReelTurnManifest struct {
	Index        int    `json:"index"`
	Speaker      string `json:"speaker"`
	Voice        string `json:"voice"`
	AudioGCSPath string `json:"audio_gcs_path"`
	WordCount    int    `json:"word_count"`
	// Text is the ENGLISH source line for this turn. The spoken audio is
	// translated to the run's language, but reel captions are intentionally
	// kept English-only (the reel script is authored in English regardless of
	// the TTS language), so this carries the un-translated text for ffmpeg-job
	// to render the on-screen captions.
	Text string `json:"text"`
}

type ReelAudioManifest struct {
	RunID    string               `json:"run_id"`
	Title    string               `json:"title"`
	Language string               `json:"language"`
	Avatars  *ReelAvatarSelection `json:"avatars,omitempty"`
	Voices   struct {
		Person1 string `json:"person1"`
		Person2 string `json:"person2"`
	} `json:"voices"`
	Turns []ReelTurnManifest `json:"turns"`
}

// ── Globals ───────────────────────────────────────────────────────────────────

var (
	storageClient       *gcs.Client
	bucketName          string
	rdb                 *goredis.Client
	gatewayURL          string
	sarvamClient        *sarvam.Client
	geminiClient        *gemini.Client
	geminiSem           chan struct{}
	bhashiniReg         *bhashini.Registry
	consumerName        string
	currentMsgID        string
	translationProvider string
)

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	_ = godotenv.Load("../../.env.shared")
	_ = godotenv.Load("../../portugese.env", "../../portuguese.env", "portugese.env", "portuguese.env")
	ctx := context.Background()

	gatewayURL = os.Getenv("GATEWAY_WEBHOOK_URL")
	if gatewayURL == "" {
		gatewayURL = "http://localhost:8080"
	}
	bucketName = os.Getenv("STORAGE_BUCKET")
	if bucketName == "" {
		bucketName = "saral-artifacts-local"
	}

	sarvamClient = &sarvam.Client{APIKey: os.Getenv("SARVAM_API_KEY")}
	geminiClient = &gemini.Client{
		APIKey:           os.Getenv("GEMINI_API_KEY"),
		BaseURL:          os.Getenv("GEMINI_API_BASE_URL"),
		TranslationModel: os.Getenv("GEMINI_TRANSLATION_MODEL"),
		TTSModel:         os.Getenv("GEMINI_TTS_MODEL"),
	}
	geminiSem = make(chan struct{}, geminiMaxConcurrent())

	translationProvider = os.Getenv("TRANSLATION_PROVIDER")
	if translationProvider == "" {
		translationProvider = "sarvam"
	}
	log.Printf("translation provider: %s", translationProvider)

	modelsPath := "models.json"
	if p := os.Getenv("MODELS_JSON_PATH"); p != "" {
		modelsPath = p
	}
	var err error
	bhashiniReg, err = bhashini.LoadRegistry(modelsPath)
	if err != nil {
		log.Fatalf("bhashini registry: %v", err)
	}

	if emulatorHost := os.Getenv("STORAGE_EMULATOR_HOST"); emulatorHost != "" {
		if !strings.HasPrefix(emulatorHost, "http") {
			emulatorHost = "http://" + emulatorHost
		}
		endpoint := emulatorHost + "/storage/v1/"
		storageClient, err = gcs.NewClient(ctx,
			option.WithEndpoint(endpoint),
			option.WithoutAuthentication(),
		)
	} else {
		storageClient, err = gcs.NewClient(ctx)
	}
	if err != nil {
		log.Fatalf("GCS client: %v", err)
	}

	redisOpt, _ := goredis.ParseURL(os.Getenv("REDIS_URL"))
	rdb = goredis.NewClient(redisOpt)
	ensureConsumerGroup(ctx)

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker"
	}
	consumerName = fmt.Sprintf("audio-gen-%s", hostname)
	log.Printf("consumer name: %s", consumerName)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("[SIGTERM] shutting down, cleaning up consumer")
		if currentMsgID != "" {
			_ = rdb.XAck(ctx, streamName, groupName, currentMsgID).Err()
		}
		_ = rdb.XGroupDelConsumer(ctx, streamName, groupName, consumerName).Err()
		os.Exit(0)
	}()

	startupSweep(ctx)

	log.Println("audio-gen worker started, listening on", streamName)
	runLoop(ctx)
}

// ── Worker loop ───────────────────────────────────────────────────────────────

func runLoop(ctx context.Context) {
	for {
		streams, err := rdb.XReadGroup(ctx, &goredis.XReadGroupArgs{
			Group:    groupName,
			Consumer: consumerName,
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
				currentMsgID = msg.ID
				processMessage(ctx, msg)
				currentMsgID = ""
			}
		}
	}
}

func processMessage(ctx context.Context, msg goredis.XMessage) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[audio-gen] panic in processMessage: %v", r)
		}
	}()

	runID := fieldStr(msg.Values, "run_id")
	stepID := fieldStr(msg.Values, "step_id")
	scriptPath := fieldStr(msg.Values, "script_gcs_path")
	userID := fieldStr(msg.Values, "user_id")
	paperID := fieldStr(msg.Values, "paper_id")
	pipelineType := fieldStr(msg.Values, "pipeline_type")
	if pipelineType == "" {
		pipelineType = "video"
	}
	sarvamKey := fieldStr(msg.Values, "sarvam_key")

	jobSarvamClient := sarvamClient
	if sarvamKey != "" {
		jobSarvamClient = &sarvam.Client{APIKey: sarvamKey}
	}

	log.Printf("[audio-gen][%s] received message id=%s script=%s pipeline_type=%s user_key=%v", runID, msg.ID, scriptPath, pipelineType, sarvamKey != "")

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("[audio-gen][%s] attempt %d/%d starting", runID, attempt, maxRetries)
		lastErr = runAudioGen(ctx, runID, stepID, scriptPath, userID, paperID, pipelineType, jobSarvamClient)
		if lastErr == nil {
			rdb.XAck(ctx, streamName, groupName, msg.ID)
			log.Printf("[audio-gen][%s] succeeded on attempt %d, ack'd msg=%s", runID, attempt, msg.ID)
			return
		}
		log.Printf("[audio-gen][%s] attempt %d/%d FAILED: %v", runID, attempt, maxRetries, lastErr)
		time.Sleep(time.Duration(attempt*3) * time.Second)
	}

	log.Printf("[audio-gen][%s] all %d attempts exhausted, sending to DLQ", runID, maxRetries)
	rdb.XAdd(ctx, &goredis.XAddArgs{Stream: dlqStream, ID: "*", Values: map[string]interface{}{
		"original_stream": streamName,
		"message_id":      msg.ID,
		"run_id":          runID,
		"step_id":         stepID,
		"error":           lastErr.Error(),
	}})
	rdb.XAck(ctx, streamName, groupName, msg.ID)
	failedStepName := "audio_gen"
	if pipelineType == "podcast" {
		failedStepName = "podcast_tts"
	} else if pipelineType == "reel" {
		failedStepName = "reel_audio_gen"
	}
	sendWebhook(runID, stepID, "failed", "", lastErr.Error(), failedStepName)
}
