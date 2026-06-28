package auth

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"google.golang.org/api/option"
)

var firebaseAuth *auth.Client


func Init(ctx context.Context) error {
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	credFile := os.Getenv("FIREBASE_CREDENTIALS_FILE")

	// Local dev without credentials: skip Firebase — auth middleware uses X-User-ID bypass
	if os.Getenv("ENV") == "local" && credFile == "" && projectID == "" {
		log.Println("Firebase Auth skipped (ENV=local, no credentials configured)")
		return nil
	}

	var app *firebase.App
	var err error

	if credFile != "" {
		// Local dev path — explicit JSON key file
		app, err = firebase.NewApp(ctx, &firebase.Config{
			ProjectID: projectID,
		}, option.WithCredentialsFile(credFile))
	} else {
		// GCP Cloud Run — ADC picks up service account automatically
		app, err = firebase.NewApp(ctx, &firebase.Config{
			ProjectID: projectID,
		})
	}

	if err != nil {
		return err
	}

	firebaseAuth, err = app.Auth(ctx)
	if err != nil {
		return err
	}

	log.Printf("Firebase Auth initialized (project=%s)", projectID)
	return nil
}

// extractProvider pulls the sign-in provider from a verified Firebase token's claims.
// The claims structure is: token.Claims["firebase"]["sign_in_provider"]

func extractProvider(token *auth.Token) string {
	fb, ok := token.Claims["firebase"].(map[string]interface{})
	if !ok {
		return "unknown"
	}
	provider, _ := fb["sign_in_provider"].(string)
	if provider == "" {
		return "unknown"
	}
	return provider
}

// Middleware returns a Gin middleware that enforces Firebase ID token authentication.

func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// ── Local dev bypass ──────────────────────────────────────────────────
		if os.Getenv("ENV") == "local" {
			if userID := c.GetHeader("X-User-ID"); userID != "" {
				c.Set("firebase_uid", userID)
				c.Set("email", userID+"@local.dev")
				c.Set("provider", "local")
				c.Next()
				return
			}
		}

		// ── Extract Bearer token ──────────────────────────────────────────────

		authHeader := c.GetHeader("Authorization")
		var idToken string
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				apiresp.AbortError(c, http.StatusUnauthorized, "invalid_authorization_format", "Authorization must be: Bearer <token>")
				return
			}
			idToken = parts[1]
		} else if t := c.Query("token"); t != "" {
			idToken = t
		} else {
			apiresp.AbortError(c, http.StatusUnauthorized, "missing_authorization", "missing Authorization header or token query param")
			return
		}

		// ── Verify token with Firebase ────────────────────────────────────────

		if firebaseAuth == nil {
			apiresp.AbortError(c, http.StatusServiceUnavailable, "firebase_not_initialized", "Firebase Auth not configured — set FIREBASE_CREDENTIALS_FILE or FIREBASE_PROJECT_ID")
			return
		}

		token, err := firebaseAuth.VerifyIDToken(c.Request.Context(), idToken)
		if err != nil {
			apiresp.AbortError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
			return
		}

		// ── Set values for downstream handlers ────────────────────────────────
		c.Set("firebase_uid", token.UID)
		c.Set("provider", extractProvider(token))

		email := ""
		if e, ok := token.Claims["email"].(string); ok {
			email = e
		}
		c.Set("email", email)

		c.Next()
	}
}

func LoginHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Token string `json:"token" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "missing_token", "token is required")
			return
		}

		// ── Local dev bypass ──────────────────────────────────────────────────
		if os.Getenv("ENV") == "local" {
			if userID := c.GetHeader("X-User-ID"); userID != "" {
				internalID, err := db.UpsertUser(c.Request.Context(), pool, userID, userID+"@local.dev", "local")
				if err != nil {
					log.Printf("Failed to upsert local dev user %s: %v", userID, err)
				}
				apiresp.OK(c, gin.H{
					"access_token": "dev-token",
					"token_type":   "bearer",
					"user": gin.H{
						"id":           internalID,
						"firebase_uid": userID,
						"email":        userID + "@local.dev",
						"provider":     "local",
					},
				})
				return
			}
		}

		// ── Real Firebase verification ────────────────────────────────────────
		if firebaseAuth == nil {
			apiresp.Error(c, http.StatusServiceUnavailable, "firebase_not_initialized", "Firebase Auth not configured — set FIREBASE_CREDENTIALS_FILE or FIREBASE_PROJECT_ID")
			return
		}
		token, err := firebaseAuth.VerifyIDToken(c.Request.Context(), req.Token)
		if err != nil {
			apiresp.Error(c, http.StatusUnauthorized, "invalid_firebase_token", "Invalid Firebase token")
			return
		}

		email, _ := token.Claims["email"].(string)
		name, _ := token.Claims["name"].(string)
		picture, _ := token.Claims["picture"].(string)
		provider := extractProvider(token)

		// ── Upsert user — tracks last_sign_in_provider for analytics ──────────
		internalID, err := db.UpsertUser(c.Request.Context(), pool, token.UID, email, provider)
		if err != nil {
			log.Printf("Failed to upsert user %s: %v", token.UID, err)
			// Don't fail — auth succeeded, DB write is best-effort
		}
		// ── Analytics: increment login counter ───────────────────────────────
		go analytics.TrackLoginSuccess(context.Background(), token.UID, email)
		// ── Webhook: notify dashboard to invalidate cache ───────────────────
		go analytics.NotifyDashboard(token.UID, email, "user_login", nil)

		apiresp.OK(c, gin.H{
			"access_token": req.Token,
			"token_type":   "bearer",
			"user": gin.H{
				"id":           internalID,
				"firebase_uid": token.UID,
				"email":        email,
				"name":         name,
				"picture":      picture,
				"provider":     provider, // e.g. "google.com", "github.com", "oidc.zoho"
			},
		})
	}
}

// MeHandler — GET /api/auth/me
func MeHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := c.Get("firebase_uid")
		email, _ := c.Get("email")
		provider, _ := c.Get("provider")
		apiresp.OK(c, gin.H{
			"id":       uid,
			"email":    email,
			"provider": provider,
			"name":     "",
			"picture":  "",
		})
	}
}


// Returns all OAuth providers linked to the current Firebase account.

func ProvidersHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := c.Get("firebase_uid")
		uidStr, ok := uid.(string)
		if !ok || uidStr == "" {
			apiresp.Error(c, http.StatusUnauthorized, "missing_uid", "no uid in context")
			return
		}

		// Local dev shortcut
		if os.Getenv("ENV") == "local" {
			apiresp.OK(c, gin.H{
				"providers": []gin.H{{"provider_id": "local", "email": uidStr + "@local.dev"}},
			})
			return
		}

		user, err := firebaseAuth.GetUser(c.Request.Context(), uidStr)
		if err != nil {
			log.Printf("ProvidersHandler: GetUser(%s) failed: %v", uidStr, err)
			apiresp.Error(c, http.StatusInternalServerError, "firebase_error", "could not retrieve user providers")
			return
		}

		// Firebase stores one ProviderUserInfo entry per linked provider.

		providers := make([]gin.H, 0, len(user.ProviderUserInfo))
		for _, p := range user.ProviderUserInfo {
			providers = append(providers, gin.H{
				"provider_id": p.ProviderID, // "google.com" | "github.com" | "microsoft.com" | "oidc.zoho"
				"email":       p.Email,
				"display_name": p.DisplayName,
				"photo_url":   p.PhotoURL,
			})
		}

		apiresp.OK(c, gin.H{"providers": providers})
	}
}

// LogoutHandler — POST /auth/logout
func LogoutHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiresp.OK(c, gin.H{"message": "Logged out successfully"})
	}
}

// VerifyHandler — GET /api/auth/verify
func VerifyHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := c.Get("firebase_uid")
		email, _ := c.Get("email")
		provider, _ := c.Get("provider")
		apiresp.OK(c, gin.H{
			"valid": true,
			"user": gin.H{
				"id":       uid,
				"email":    email,
				"provider": provider,
			},
		})
	}
}