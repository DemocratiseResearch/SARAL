// gateway/main.go

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/joho/godotenv"
	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/auth"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/pipeline"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/social"
	"github.com/saral/gateway/internal/sse"
	"github.com/saral/gateway/internal/storage"
	"github.com/saral/gateway/internal/webhook"
)

func main() {
	_ = godotenv.Overload()
	ctx := context.Background()

	storage.Init()
	go storage.SeedAvatarsIfMissing(ctx, "assets", models.ReelAvatarFilenames(), models.ReelAvatarGCSPrefix)

	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatalf("Postgres init failed: %v", err)
	}
	defer pool.Close()

	rdb := redisx.NewClient()
	redisx.EnsureConsumerGroups(ctx, rdb)
	go redisx.StartJanitor(ctx, rdb, pool) // background retry loop

	// ── Firebase Auth ─────────────────────────────────────────────────────────
	if err := auth.Init(ctx); err != nil {
		log.Fatalf("Firebase init failed: %v", err)
	}

	// ── Analytics / Firestore ─────────────────────────────────────────────────
	if err := analytics.Init(ctx); err != nil {
		log.Printf("Analytics/Firestore init failed (non-fatal): %v", err)
	}

	// ── SSE Manager — MUST receive rdb for Redis Pub/Sub cross-instance relay ─
	sseMgr := sse.NewManager(rdb, pool)

	// ── Gin router ────────────────────────────────────────────────────────────
	if os.Getenv("ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(sensitiveParamLogger())

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// ── Public routes (no auth) ───────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		apiresp.OK(c, gin.H{"status": "ok"})
	})
	r.GET("/api/templates", func(c *gin.Context) {
		apiresp.OK(c, []gin.H{
			{"id": "template-saral", "name": "SARAL Template"},
			{"id": "sampleppt", "name": "Sample PPT Template"},
		})
	})
	r.GET("/api/voices", func(c *gin.Context) {
		apiresp.OK(c, gin.H{
			"male":    []string{"aditya", "shubh", "aayan"},
			"female":  []string{"simran", "roopa", "ishita"},
			"default": "female",
			"note":    "Pass voice_gender=male|female in POST /script/confirm body to select gender. A single speaker is chosen randomly from the pool for the entire run.",
		})
	})
	r.GET("/api/languages", func(c *gin.Context) {
		apiresp.OK(c, gin.H{
			"supported": []gin.H{
				{"name": "English", "code": "en-IN", "translation": "none", "tts": "sarvam-bulbul-v3"},
				{"name": "Hindi", "code": "hi-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Bengali", "code": "bn-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Tamil", "code": "ta-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Telugu", "code": "te-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Kannada", "code": "kn-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Malayalam", "code": "ml-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Marathi", "code": "mr-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Gujarati", "code": "gu-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Punjabi", "code": "pa-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Odia", "code": "od-IN", "translation": "sarvam-mayura-v1", "tts": "sarvam-bulbul-v3"},
				{"name": "Assamese", "code": "as-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Bodo", "code": "brx-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Dogri", "code": "doi-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Maithili", "code": "mai-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Manipuri", "code": "mni-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Sanskrit", "code": "sa-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Santali", "code": "sat-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Urdu", "code": "ur-IN", "translation": "sarvam-translate-v1", "tts": "bhashini"},
				{"name": "Portuguese (Brazil)", "code": "pt-BR", "translation": "gemini", "tts": "gemini-tts"},
				{"name": "Portuguese (Portugal)", "code": "pt-PT", "translation": "gemini", "tts": "gemini-tts"},
			},
			"default": "English",
			"note":    "Pass the 'name' value (e.g. 'Hindi') as the 'language' field in PUT /script or POST /script/confirm. Case-insensitive. BCP-47 codes (e.g. 'hi-IN', 'pt-BR') are also accepted for backward compatibility.",
		})
	})
	r.POST("/auth/login", auth.LoginHandler(pool))              // verify Firebase token (OAuth providers) + return user info
	r.POST("/auth/logout", auth.LogoutHandler())
	r.POST("/auth/email/signup", auth.EmailSignUpHandler(pool))          // email/password sign-up (with account-linking dedup)
	r.POST("/auth/email/signin", auth.EmailSignInHandler(pool))          // email/password sign-in → returns same shape as /auth/login
	r.POST("/auth/email/forgot-password", auth.EmailForgotPasswordHandler())    // triggers Firebase password-reset email
	r.POST("/auth/email/reset-password", auth.EmailResetPasswordHandler())      // confirms reset using oobCode from the link
	r.POST("/auth/oauth/google", auth.GoogleOAuthHandler(pool))                 // Chrome extension: Google access token → Firebase ID token

	// Webhook receiver — called by Python workers on private VPC network
	// No auth middleware here: these are internal service-to-service calls
	r.POST("/webhooks/worker/:service", webhook.Handler(pool, rdb, sseMgr))

	// OAuth callbacks — public routes (browser redirect from platform, no Firebase token)
	r.GET("/auth/social/youtube/callback", social.YouTubeCallbackHandler(pool, rdb))
	r.GET("/auth/social/linkedin/callback", social.LinkedInCallbackHandler(pool, rdb))

	// ── Protected routes (Firebase auth required) ─────────────────────────────
	protected := r.Group("/api")
	protected.Use(auth.Middleware())
	protected.GET("/auth/me", auth.MeHandler())
	protected.GET("/auth/providers", auth.ProvidersHandler())
	protected.GET("/auth/verify", auth.VerifyHandler())
	protected.GET("/user/keys", auth.KeysGetHandler(pool))
	protected.PUT("/user/keys", auth.KeysPutHandler(pool))
	{
		protected.GET("/papertovideo/papers", pipeline.PapersHandler(pool))
		protected.POST("/papertovideo/upload", pipeline.UploadHandler(pool, rdb, sseMgr))
		protected.GET("/papertovideo/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/papertovideo/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/papertovideo/:run_id/extracted", pipeline.ExtractedHandler(pool))

		// Script editing routes
		protected.GET("/papertovideo/:run_id/script", pipeline.ScriptHandler(pool))
		protected.PUT("/papertovideo/:run_id/script", pipeline.UpdateScriptHandler(pool))
		protected.PATCH("/papertovideo/:run_id/script/images", pipeline.ImageAssignHandler(pool))
		protected.POST("/papertovideo/:run_id/script/confirm", pipeline.ContinueAfterScriptHandler(pool, rdb, sseMgr))
		protected.POST("/papertovideo/:run_id/generate-video", pipeline.GenerateVideoHandler(pool, rdb, sseMgr))
		protected.POST("/papertovideo/:run_id/retry", pipeline.RetryRunHandler(pool, rdb, sseMgr))

		// Social draft routes (LinkedIn, X/Twitter)
		protected.POST("/papertovideo/:run_id/social/linkedin", pipeline.TriggerLinkedInDraftHandler(pool, rdb, sseMgr))
		protected.GET("/papertovideo/:run_id/social/linkedin", pipeline.GetLinkedInDraftHandler(pool))
		protected.POST("/papertovideo/:run_id/social/twitter", pipeline.TriggerTwitterDraftHandler(pool, rdb, sseMgr))
		protected.GET("/papertovideo/:run_id/social/twitter", pipeline.GetTwitterDraftHandler(pool))

		// Presentation artifacts routes
		protected.GET("/papertovideo/:run_id/slides", pipeline.SlidesHandler(pool))
		protected.GET("/papertovideo/:run_id/audio", pipeline.AudioManifestHandler(pool))
		protected.GET("/papertovideo/:run_id/audio/:slide_index", pipeline.AudioSlideHandler(pool))
		protected.GET("/papertovideo/:run_id/images", pipeline.ImagesHandler(pool))

		// Final video download (forces file save) and stream (in-browser playback with Range support)
		protected.GET("/papertovideo/:run_id/download", pipeline.DownloadHandler(pool))
		protected.GET("/papertovideo/:run_id/video", pipeline.VideoStreamHandler(pool))

		// ── Paper → Slides / PDF (no video) ────────────────────────────────────
		protected.POST("/papertoslides/start", pipeline.SlidesPaperStartHandler(pool, rdb, sseMgr))
		protected.GET("/papertoslides/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/papertoslides/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/papertoslides/:run_id/script", pipeline.ScriptHandler(pool))
		protected.PUT("/papertoslides/:run_id/script", pipeline.UpdateScriptHandler(pool))
		protected.PATCH("/papertoslides/:run_id/script/images", pipeline.ImageAssignHandler(pool))
		protected.POST("/papertoslides/:run_id/template", pipeline.SlidesTemplateUploadHandler(pool))
		protected.POST("/papertoslides/:run_id/confirm", pipeline.SlidesConfirmHandler(pool, rdb, sseMgr))
		protected.GET("/papertoslides/:run_id/slides", pipeline.SlidesHandler(pool))
		protected.GET("/papertoslides/:run_id/deck", pipeline.SlidesDeckURLsHandler(pool))
		protected.GET("/papertoslides/:run_id/images", pipeline.ImagesHandler(pool))

		// ── Paper → Poster pipeline ───────────────────────────────────────────
		protected.POST("/papertoposter/start", pipeline.PosterStartHandler(pool, rdb, sseMgr))
		protected.GET("/papertoposter/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/papertoposter/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/papertoposter/:run_id/content", pipeline.PosterContentHandler(pool))
		protected.POST("/papertoposter/:run_id/confirm", pipeline.PosterConfirmHandler(pool, rdb, sseMgr))
		protected.GET("/papertoposter/:run_id/download", pipeline.PosterDownloadHandler(pool))
		protected.POST("/papertoposter/:run_id/retry", pipeline.RetryRunHandler(pool, rdb, sseMgr))

		// Social sharing — YouTube OAuth + upload
		protected.GET("/social/youtube/auth", social.YouTubeAuthHandler(rdb))
		protected.GET("/social/status", social.ConnectionStatusHandler(pool))
		protected.POST("/papertovideo/:run_id/share/youtube", social.ShareYouTubeHandler(pool))

		// Social sharing — LinkedIn OAuth + native video post
		protected.GET("/social/linkedin/auth", social.LinkedInAuthHandler(rdb))
		protected.POST("/papertovideo/:run_id/share/linkedin", social.ShareLinkedInHandler(pool))

		// ── Paper → Podcast pipeline ──────────────────────────────────────────
		protected.POST("/papertopodcast/start", pipeline.PodcastStartHandler(pool, rdb, sseMgr))
		protected.GET("/papertopodcast/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/papertopodcast/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/papertopodcast/:run_id/script", pipeline.PodcastScriptHandler(pool))
		protected.GET("/papertopodcast/:run_id/audio", pipeline.PodcastAudioDownloadHandler(pool))
		protected.GET("/papertopodcast/:run_id/download", pipeline.PodcastDownloadHandler(pool))
		protected.GET("/papertopodcast/:run_id/video", pipeline.PodcastVideoDownloadHandler(pool))
		protected.POST("/papertopodcast/:run_id/retry", pipeline.RetryRunHandler(pool, rdb, sseMgr))

		// ── Paper → Reel pipeline ─────────────────────────────────────────────
		protected.POST("/papertoreel/start", pipeline.ReelStartHandler(pool, rdb, sseMgr))
		protected.GET("/papertoreel/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/papertoreel/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/papertoreel/:run_id/script", pipeline.ReelScriptHandler(pool))
		protected.PUT("/papertoreel/:run_id/script", pipeline.ReelUpdateScriptHandler(pool))
		protected.GET("/papertoreel/avatars", pipeline.ReelAvatarsHandler())
		protected.POST("/papertoreel/:run_id/avatars", pipeline.ReelAvatarSelectionHandler(pool))
		protected.POST("/papertoreel/:run_id/finalize", pipeline.ReelFinalizeHandler(pool, rdb, sseMgr))
		protected.GET("/papertoreel/:run_id/download", pipeline.ReelDownloadHandler(pool))
		protected.GET("/papertoreel/:run_id/video", pipeline.ReelVideoStreamHandler(pool))
		protected.POST("/papertoreel/:run_id/retry", pipeline.RetryRunHandler(pool, rdb, sseMgr))

		// Business brief — paper-level artifact (independent of the video pipeline)
		protected.POST("/paper/:paper_id/business-brief", pipeline.BusinessBriefGenerateHandler(pool, rdb, sseMgr))
		protected.GET("/paper/:paper_id/business-brief", pipeline.BusinessBriefGetHandler(pool))
		protected.PUT("/paper/:paper_id/business-brief", pipeline.BusinessBriefUpdateHandler(pool, rdb))
		protected.GET("/paper/:paper_id/business-brief/pdf", pipeline.BusinessBriefDownloadPDFHandler(pool))
		protected.GET("/paper/:paper_id/business-brief/stream", sseMgr.BriefStreamHandler())

		// ── ArXiv / BioRxiv / MedRxiv ingest ─────────────────────────────────
		// Same pipeline as PDF upload — pdf-parser and all downstream workers unchanged.
		protected.POST("/papers/arxiv", pipeline.ArxivIngestHandler(pool, rdb, sseMgr))

		// ── Patent → Video pipeline ───────────────────────────────────────────
		// Patent runs reuse the video pipeline artifacts and handlers.
		// script-gen detects document_type=patent and uses the patent prompt.
		protected.POST("/patenttovideo/upload", pipeline.PatentUploadHandler(pool, rdb, sseMgr))
		protected.GET("/patenttovideo/:run_id/status", pipeline.StatusHandler(pool))
		protected.GET("/patenttovideo/:run_id/stream", sseMgr.StreamHandler())
		protected.GET("/patenttovideo/:run_id/script", pipeline.ScriptHandler(pool))
		protected.PUT("/patenttovideo/:run_id/script", pipeline.UpdateScriptHandler(pool))
		protected.PATCH("/patenttovideo/:run_id/script/images", pipeline.ImageAssignHandler(pool))
		protected.POST("/patenttovideo/:run_id/script/confirm", pipeline.ContinueAfterScriptHandler(pool, rdb, sseMgr))
		protected.POST("/patenttovideo/:run_id/generate-video", pipeline.GenerateVideoHandler(pool, rdb, sseMgr))
		protected.GET("/patenttovideo/:run_id/slides", pipeline.SlidesHandler(pool))
		protected.GET("/patenttovideo/:run_id/audio", pipeline.AudioManifestHandler(pool))
		protected.GET("/patenttovideo/:run_id/download", pipeline.DownloadHandler(pool))
		protected.GET("/patenttovideo/:run_id/video", pipeline.VideoStreamHandler(pool))
		protected.POST("/patenttovideo/:run_id/retry", pipeline.RetryRunHandler(pool, rdb, sseMgr))

		// ── Analytics ────────────────────────────────────────────────────────
		analytics.RegisterRoutes(protected)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("SARAL Gateway starting on :%s (ENV=%s)", port, os.Getenv("ENV"))
	log.Fatal(http.ListenAndServe(":"+port, r))
}

// sensitiveParamLogger returns a Gin logger handler that redacts sensitive
// query parameters (token, code, state, API keys, etc.) from log output.
func sensitiveParamLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		path := param.Request.URL.RequestURI()
		path = apiresp.SanitizeURL(path)

		var statusColor, methodColor, resetColor string
		if param.IsOutputColor() {
			statusColor = param.StatusCodeColor()
			methodColor = param.MethodColor()
			resetColor = param.ResetColor()
		}
		if param.Latency > param.Latency.Truncate(time.Minute) {
			param.Latency = param.Latency.Truncate(time.Second)
		}
		return fmt.Sprintf("[GIN] %v |%s %3d %s| %13v | %15s |%s %-7s %s %#v\n%s",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			statusColor, param.StatusCode, resetColor,
			param.Latency,
			param.ClientIP,
			methodColor, param.Method, resetColor,
			path,
			param.ErrorMessage,
		)
	})
}
