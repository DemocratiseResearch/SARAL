package social

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/storage"
)

// ── OAuth state management via Redis ──────────────────────────────────────────

const oauthStateTTL = 10 * time.Minute
const redisOAuthPrefix = "saral:oauth:state:"

func generateState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func storeOAuthState(ctx context.Context, rdb *goredis.Client, state, firebaseUID string) error {
	return rdb.Set(ctx, redisOAuthPrefix+state, firebaseUID, oauthStateTTL).Err()
}

func retrieveOAuthState(ctx context.Context, rdb *goredis.Client, state string) (string, error) {
	key := redisOAuthPrefix + state
	firebaseUID, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return "", fmt.Errorf("invalid or expired oauth state")
	}
	// One-time use: delete after retrieval
	rdb.Del(ctx, key)
	return firebaseUID, nil
}

// ── YouTube OAuth handlers ────────────────────────────────────────────────────

func YouTubeAuthHandler(rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		firebaseUID := c.MustGet("firebase_uid").(string)

		state, err := generateState()
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "state_generation_failed", err.Error())
			return
		}

		if err := storeOAuthState(ctx, rdb, state, firebaseUID); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "state_store_failed", err.Error())
			return
		}

		yt := NewYouTubeClient()
		authURL := yt.BuildAuthURL(state)

		apiresp.OK(c, gin.H{"auth_url": authURL})
	}
}

// YouTubeCallbackHandler handles the OAuth callback from Google.

func YouTubeCallbackHandler(pool *pgxpool.Pool, rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		code := c.Query("code")
		state := c.Query("state")
		errParam := c.Query("error")

		if errParam != "" {
			redirectWithError(c, "YouTube authorization denied: "+errParam)
			return
		}
		if code == "" || state == "" {
			redirectWithError(c, "missing code or state parameter")
			return
		}

		// Look up the firebase UID from the state
		firebaseUID, err := retrieveOAuthState(ctx, rdb, state)
		if err != nil {
			redirectWithError(c, err.Error())
			return
		}

		// Exchange the code for tokens
		yt := NewYouTubeClient()
		tokens, err := yt.ExchangeCode(ctx, code)
		if err != nil {
			log.Printf("YouTube token exchange failed for %s: %v", firebaseUID, err)
			redirectWithError(c, "token exchange failed")
			return
		}

		// Store tokens on the user
		if err := db.SaveYouTubeTokens(ctx, pool, firebaseUID, tokens.AccessToken, tokens.RefreshToken, tokens.Expiry); err != nil {
			log.Printf("Failed to save YouTube tokens for %s: %v", firebaseUID, err)
			redirectWithError(c, "failed to save credentials")
			return
		}

		// Return a self-closing HTML page for the popup window
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, `<!DOCTYPE html>
<html><head><title>Connected</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb">
<div style="text-align:center">
<div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
<svg width="24" height="24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>
<p style="font-size:16px;font-weight:600;color:#111;margin:0 0 4px">YouTube Connected!</p>
<p style="font-size:13px;color:#666;margin:0">This window will close automatically...</p>
</div>
<script>setTimeout(function(){window.close()},1500)</script>
</body></html>`)
	}
}

// ── LinkedIn OAuth handlers ───────────────────────────────────────────────────

func LinkedInAuthHandler(rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		firebaseUID := c.MustGet("firebase_uid").(string)

		state, err := generateState()
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "state_generation_failed", err.Error())
			return
		}

		if err := storeOAuthState(ctx, rdb, state, firebaseUID); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "state_store_failed", err.Error())
			return
		}

		li := NewLinkedInClient()
		authURL := li.BuildAuthURL(state)

		apiresp.OK(c, gin.H{"auth_url": authURL})
	}
}

// LinkedInCallbackHandler handles the OAuth callback from LinkedIn.

func LinkedInCallbackHandler(pool *pgxpool.Pool, rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		code := c.Query("code")
		state := c.Query("state")
		errParam := c.Query("error")

		if errParam != "" {
			redirectWithError(c, "LinkedIn authorization denied: "+errParam)
			return
		}
		if code == "" || state == "" {
			redirectWithError(c, "missing code or state parameter")
			return
		}

		firebaseUID, err := retrieveOAuthState(ctx, rdb, state)
		if err != nil {
			redirectWithError(c, err.Error())
			return
		}

		li := NewLinkedInClient()
		tokens, err := li.ExchangeCode(ctx, code)
		if err != nil {
			log.Printf("LinkedIn token exchange failed for %s: %v", firebaseUID, err)
			redirectWithError(c, "token exchange failed")
			return
		}

		// Cache the member URN now so share requests skip the round-trip.
		personURN, err := li.FetchPersonURN(ctx, tokens.AccessToken)
		if err != nil {
			log.Printf("LinkedIn userinfo failed for %s: %v", firebaseUID, err)
			redirectWithError(c, "failed to fetch LinkedIn profile")
			return
		}

		if err := db.SaveLinkedInTokens(ctx, pool, firebaseUID, tokens.AccessToken, tokens.RefreshToken, personURN, tokens.Expiry); err != nil {
			log.Printf("Failed to save LinkedIn tokens for %s: %v", firebaseUID, err)
			redirectWithError(c, "failed to save credentials")
			return
		}

		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, `<!DOCTYPE html>
<html><head><title>Connected</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb">
<div style="text-align:center">
<div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
<svg width="24" height="24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>
<p style="font-size:16px;font-weight:600;color:#111;margin:0 0 4px">LinkedIn Connected!</p>
<p style="font-size:13px;color:#666;margin:0">This window will close automatically...</p>
</div>
<script>setTimeout(function(){window.close()},1500)</script>
</body></html>`)
	}
}

// ── Share handler ─────────────────────────────────────────────────────────────


func ShareYouTubeHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		// 1. Parse run_id
		runIDStr := c.Param("run_id")
		runID, err := uuid.Parse(runIDStr)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id format")
			return
		}

		// 2. Get the run and verify ownership
		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "pipeline run not found")
			return
		}

		userID := getUserID(c, pool)
		if run.UserID != userID {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "pipeline run not found")
			return
		}

		// 3. Check pipeline is completed
		if run.Status != "completed" {
			apiresp.Error(c, http.StatusConflict, "video_not_ready", "pipeline run has not completed yet")
			return
		}

		// 4. Parse share request
		var req models.ShareRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		// 5. Get YouTube tokens
		tokens, err := db.GetYouTubeTokens(ctx, pool, userID)
		if err != nil || tokens.AccessToken == "" {
			apiresp.Error(c, http.StatusUnauthorized, "platform_not_connected", "connect your YouTube account first via /api/social/youtube/auth")
			return
		}

		// 6. Refresh token if expired
		accessToken := tokens.AccessToken
		if tokens.Expired() {
			if tokens.RefreshToken == "" {
				apiresp.Error(c, http.StatusUnauthorized, "token_refresh_failed", "please reconnect your YouTube account")
				return
			}
			yt := NewYouTubeClient()
			refreshed, err := yt.RefreshAccessToken(ctx, tokens.RefreshToken)
			if err != nil {
				log.Printf("YouTube token refresh failed for user %s: %v", userID, err)
				apiresp.Error(c, http.StatusUnauthorized, "token_refresh_failed", "please reconnect your YouTube account")
				return
			}
			accessToken = refreshed.AccessToken
			// Update the stored access token
			_ = db.UpdateYouTubeAccessToken(ctx, pool, userID, refreshed.AccessToken, refreshed.Expiry)
		}

		// 7. Get the video artifact from GCS
		videoPath, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_found", "video artifact not found for this run")
			return
		}

		videoReader, videoSize, err := storage.NewReader(ctx, videoPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "video_read_failed", "failed to read video from storage")
			return
		}
		defer videoReader.Close()

		// 8. Upload to YouTube
		yt := NewYouTubeClient()
		result, err := yt.UploadVideo(ctx, accessToken, videoReader, videoSize, req)
		if err != nil {
			log.Printf("YouTube upload failed for run %s: %v", runID, err)
			apiresp.Error(c, http.StatusBadGateway, "platform_upload_failed", "YouTube upload failed: "+err.Error())
			return
		}

		apiresp.OK(c, result)
	}
}


func ShareLinkedInHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		runIDStr := c.Param("run_id")
		runID, err := uuid.Parse(runIDStr)
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id format")
			return
		}

		run, err := db.GetRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "pipeline run not found")
			return
		}

		userID := getUserID(c, pool)
		if run.UserID != userID {
			apiresp.Error(c, http.StatusNotFound, "run_not_found", "pipeline run not found")
			return
		}

		if run.Status != "completed" {
			apiresp.Error(c, http.StatusConflict, "video_not_ready", "pipeline run has not completed yet")
			return
		}

		var req models.ShareRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		conn, err := db.GetLinkedInConnection(ctx, pool, userID)
		if err != nil || conn.Tokens.AccessToken == "" || conn.PersonURN == "" {
			apiresp.Error(c, http.StatusUnauthorized, "platform_not_connected", "connect your LinkedIn account first via /api/social/linkedin/auth")
			return
		}

		accessToken := conn.Tokens.AccessToken
		if conn.Tokens.Expired() {
			if conn.Tokens.RefreshToken == "" {
				// Most LinkedIn apps are not approved for refresh tokens —
				// the member has to reconnect every ~60 days.
				apiresp.Error(c, http.StatusUnauthorized, "token_refresh_failed", "please reconnect your LinkedIn account")
				return
			}
			li := NewLinkedInClient()
			refreshed, err := li.RefreshAccessToken(ctx, conn.Tokens.RefreshToken)
			if err != nil {
				log.Printf("LinkedIn token refresh failed for user %s: %v", userID, err)
				apiresp.Error(c, http.StatusUnauthorized, "token_refresh_failed", "please reconnect your LinkedIn account")
				return
			}
			accessToken = refreshed.AccessToken
			_ = db.UpdateLinkedInAccessToken(ctx, pool, userID, refreshed.AccessToken, refreshed.RefreshToken, refreshed.Expiry)
		}

		videoPath, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_found", "video artifact not found for this run")
			return
		}

		videoReader, videoSize, err := storage.NewReader(ctx, videoPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "video_read_failed", "failed to read video from storage")
			return
		}
		defer videoReader.Close()

		li := NewLinkedInClient()
		result, err := li.UploadVideo(ctx, accessToken, conn.PersonURN, videoReader, videoSize, req)
		if err != nil {
			log.Printf("LinkedIn upload failed for run %s: %v", runID, err)
			apiresp.Error(c, http.StatusBadGateway, "platform_upload_failed", "LinkedIn upload failed: "+err.Error())
			return
		}

		apiresp.OK(c, result)
	}
}

// ── Connection status ─────────────────────────────────────────────────────────

func ConnectionStatusHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userID := getUserID(c, pool)

		ytTokens, err := db.GetYouTubeTokens(ctx, pool, userID)
		youtubeConnected := err == nil && ytTokens.AccessToken != ""

		liConn, err := db.GetLinkedInConnection(ctx, pool, userID)
		linkedinConnected := err == nil && liConn.Tokens.AccessToken != "" && liConn.PersonURN != ""

		apiresp.OK(c, gin.H{
			"youtube":  youtubeConnected,
			"linkedin": linkedinConnected,
			"twitter":  false, // pending team approval on X API tier
		})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func getUserID(c *gin.Context, pool *pgxpool.Pool) uuid.UUID {
	if uid := c.GetHeader("X-User-ID"); uid != "" {
		id, err := uuid.Parse(uid)
		if err == nil {
			return id
		}
	}
	firebaseUID := c.MustGet("firebase_uid").(string)
	id, _ := db.GetUserByFirebaseUID(c.Request.Context(), pool, firebaseUID)
	return id
}

func redirectWithError(c *gin.Context, errMsg string) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!DOCTYPE html>
<html><head><title>Error</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb">
<div style="text-align:center">
<div style="width:48px;height:48px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
<svg width="24" height="24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</div>
<p style="font-size:16px;font-weight:600;color:#111;margin:0 0 4px">Connection Failed</p>
<p style="font-size:13px;color:#666;margin:0">`+errMsg+`</p>
<p style="font-size:12px;color:#999;margin:8px 0 0">You can close this window and try again.</p>
</div>
</body></html>`)
}
