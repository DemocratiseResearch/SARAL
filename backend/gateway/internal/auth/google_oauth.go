

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
)

// firebaseSignInWithGoogle exchanges a Google OAuth access token for a

func firebaseSignInWithGoogle(ctx context.Context, googleAccessToken string) (idToken string, err error) {
	apiKey := os.Getenv("FIREBASE_WEB_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("FIREBASE_WEB_API_KEY not configured")
	}

	type reqBody struct {
		RequestURI          string `json:"requestUri"`
		PostBody            string `json:"postBody"`
		ReturnSecureToken   bool   `json:"returnSecureToken"`
		ReturnIdpCredential bool   `json:"returnIdpCredential"`
	}

	bodyBytes, err := json.Marshal(reqBody{
		RequestURI:          "http://localhost",
		PostBody:            fmt.Sprintf("access_token=%s&providerId=google.com", googleAccessToken),
		ReturnSecureToken:   true,
		ReturnIdpCredential: true,
	})
	if err != nil {
		return "", fmt.Errorf("marshal signInWithIdp body: %w", err)
	}

	const endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key="
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint+apiKey, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("firebase signInWithIdp: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &errResp) == nil && errResp.Error.Message != "" {
			return "", fmt.Errorf("firebase: %s", errResp.Error.Message)
		}
		return "", fmt.Errorf("firebase signInWithIdp failed (status %d)", resp.StatusCode)
	}

	var result struct {
		IDToken string `json:"idToken"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse signInWithIdp response: %w", err)
	}
	if result.IDToken == "" {
		return "", fmt.Errorf("firebase returned empty idToken")
	}
	return result.IDToken, nil
}


func GoogleOAuthHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ── Local dev bypass ─────────────────────────────────────────────────
		if os.Getenv("ENV") == "local" && firebaseAuth == nil {
			apiresp.OK(c, gin.H{
				"access_token": "dev-google-token",
				"token_type":   "bearer",
				"user": gin.H{
					"id": "local-dev", "firebase_uid": "local-dev",
					"email": "dev-google@local.dev", "provider": "google.com",
				},
			})
			return
		}

		if firebaseAuth == nil {
			apiresp.Error(c, http.StatusServiceUnavailable, "firebase_not_initialized",
				"Firebase Auth not configured")
			return
		}

		var req struct {
			AccessToken string `json:"access_token" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		ctx := c.Request.Context()

		// ── Step 1: Google access token → Firebase ID token ──────────────────
		idToken, err := firebaseSignInWithGoogle(ctx, req.AccessToken)
		if err != nil {
			msg := err.Error()
			code := "invalid_token"
			status := http.StatusUnauthorized

			switch {
			case strings.Contains(msg, "INVALID_IDP_RESPONSE"),
				strings.Contains(msg, "INVALID_CREDENTIAL_OR_PROVIDER_ID"):
				code = "invalid_google_token"
			case strings.Contains(msg, "FEDERATED_USER_ID_ALREADY_LINKED"):
				code = "already_linked"
			case strings.Contains(msg, "FIREBASE_WEB_API_KEY"):
				code = "service_unavailable"
				status = http.StatusServiceUnavailable
			}

			apiresp.Error(c, status, code, "Google sign-in failed")
			return
		}

		// ── Step 2: verify token + upsert user in DB ─────────────────────────
		token, err := firebaseAuth.VerifyIDToken(ctx, idToken)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "token_verify_failed",
				"token verification failed")
			return
		}

		email, _ := token.Claims["email"].(string)
		name, _ := token.Claims["name"].(string)
		picture, _ := token.Claims["picture"].(string)
		provider := extractProvider(token)

		internalID, dbErr := db.UpsertUser(ctx, pool, token.UID, email, provider)
		if dbErr != nil {
			log.Printf("GoogleOAuthHandler: UpsertUser failed for %s: %v", token.UID, dbErr)
		}
		go analytics.TrackLoginSuccess(context.Background(), token.UID, email)
		go analytics.NotifyDashboard(token.UID, email, "user_login", nil)

		apiresp.OK(c, gin.H{
			"access_token": idToken,
			"token_type":   "bearer",
			"user": gin.H{
				"id":           internalID,
				"firebase_uid": token.UID,
				"email":        email,
				"name":         name,
				"picture":      picture,
				"provider":     provider,
			},
		})
	}
}
