// gateway/internal/auth/email.go
//
// Email/password auth handlers: sign up, sign in, forgot password.

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

	fbauth "firebase.google.com/go/v4/auth"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/analytics"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
)

// ── Firebase REST API helpers ─────────────────────────────────────────────────

func firebaseSignInWithPassword(ctx context.Context, email, password string) (idToken string, err error) {
	apiKey := os.Getenv("FIREBASE_WEB_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("FIREBASE_WEB_API_KEY not configured")
	}

	type reqBody struct {
		Email             string `json:"email"`
		Password          string `json:"password"`
		ReturnSecureToken bool   `json:"returnSecureToken"`
	}
	bodyBytes, err := json.Marshal(reqBody{Email: email, Password: password, ReturnSecureToken: true})
	if err != nil {
		return "", fmt.Errorf("marshal sign-in body: %w", err)
	}

	const endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint+apiKey, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("firebase REST sign-in: %w", err)
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
		return "", fmt.Errorf("firebase sign-in failed (status %d)", resp.StatusCode)
	}

	var result struct {
		IDToken string `json:"idToken"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse sign-in response: %w", err)
	}
	if result.IDToken == "" {
		return "", fmt.Errorf("firebase returned empty idToken")
	}
	return result.IDToken, nil
}

// firebaseSendPasswordResetEmail calls the Firebase Identity Toolkit REST API
// to trigger a password-reset email. Firebase delivers the email using the
// project's configured "Password reset" email template.
func firebaseSendPasswordResetEmail(ctx context.Context, email string) error {
	apiKey := os.Getenv("FIREBASE_WEB_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("FIREBASE_WEB_API_KEY not configured")
	}

	type reqBody struct {
		RequestType string `json:"requestType"`
		Email       string `json:"email"`
	}
	bodyBytes, err := json.Marshal(reqBody{RequestType: "PASSWORD_RESET", Email: email})
	if err != nil {
		return fmt.Errorf("marshal reset body: %w", err)
	}

	const endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key="
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint+apiKey, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("firebase REST sendOobCode: %w", err)
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
			return fmt.Errorf("firebase: %s", errResp.Error.Message)
		}
		return fmt.Errorf("firebase sendOobCode failed (status %d)", resp.StatusCode)
	}
	return nil
}

// firebaseConfirmPasswordReset exchanges a Firebase oobCode + new password
// via the Identity Toolkit REST API. Returns the email address on success.
func firebaseConfirmPasswordReset(ctx context.Context, oobCode, newPassword string) (email string, err error) {
	apiKey := os.Getenv("FIREBASE_WEB_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("FIREBASE_WEB_API_KEY not configured")
	}

	type reqBody struct {
		OobCode     string `json:"oobCode"`
		NewPassword string `json:"newPassword"`
	}
	bodyBytes, err := json.Marshal(reqBody{OobCode: oobCode, NewPassword: newPassword})
	if err != nil {
		return "", fmt.Errorf("marshal reset-confirm body: %w", err)
	}

	const endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key="
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint+apiKey, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("firebase REST resetPassword: %w", err)
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
		return "", fmt.Errorf("firebase resetPassword failed (status %d)", resp.StatusCode)
	}

	var result struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse reset-confirm response: %w", err)
	}
	return result.Email, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func EmailResetPasswordHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			OobCode     string `json:"oob_code" binding:"required"`
			NewPassword string `json:"new_password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		// ── Password quality check (same rules as sign-up) ────────────────────
		if violation := validatePassword(req.NewPassword, ""); violation != nil {
			apiresp.Error(c, http.StatusUnprocessableEntity, violation.Code, violation.Message)
			return
		}

		ctx := c.Request.Context()

		// ── Confirm the reset with Firebase ───────────────────────────────────
		email, err := firebaseConfirmPasswordReset(ctx, req.OobCode, req.NewPassword)
		if err != nil {
			msg := err.Error()
			switch {
			case strings.Contains(msg, "EXPIRED_OOB_CODE"):
				apiresp.Error(c, http.StatusUnprocessableEntity, "reset_link_expired",
					"this reset link has expired — please request a new one")
			case strings.Contains(msg, "INVALID_OOB_CODE"):
				apiresp.Error(c, http.StatusUnprocessableEntity, "reset_link_invalid",
					"this reset link is invalid or has already been used")
			case strings.Contains(msg, "USER_DISABLED"):
				apiresp.Error(c, http.StatusForbidden, "user_disabled",
					"this account has been disabled")
			default:
				log.Printf("EmailResetPasswordHandler: confirmReset failed: %v", err)
				apiresp.Error(c, http.StatusInternalServerError, "reset_failed",
					"could not reset password — please try again")
			}
			return
		}

		apiresp.OK(c, gin.H{
			"message": "password updated successfully — you can now sign in",
			"email":   email,
		})
	}
}

// EmailSignUpHandler — POST /auth/email/signup
func EmailSignUpHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ── Local dev bypass ─────────────────────────────────────────────────
		if os.Getenv("ENV") == "local" && firebaseAuth == nil {
			apiresp.OK(c, gin.H{
				"access_token": "dev-email-token",
				"token_type":   "bearer",
				"user": gin.H{
					"id": "local-dev", "firebase_uid": "local-dev",
					"email": "dev@local.dev", "provider": "password",
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
			Email    string `json:"email" binding:"required,email"`
			Password string `json:"password" binding:"required"`
			Name     string `json:"name"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		// ── Password quality guard-rails ──────────────────────────────────────
		if violation := validatePassword(req.Password, req.Email); violation != nil {
			apiresp.Error(c, http.StatusUnprocessableEntity, violation.Code, violation.Message)
			return
		}

		ctx := c.Request.Context()

		// ── Step 1: check for an existing account with the same email ─────────
		existingUser, err := firebaseAuth.GetUserByEmail(ctx, req.Email)
		if err != nil {
			if fbauth.IsUserNotFound(err) {
				// No existing account — create a fresh one.
				params := (&fbauth.UserToCreate{}).
					Email(req.Email).
					Password(req.Password)
				if req.Name != "" {
					params = params.DisplayName(req.Name)
				}
				if _, createErr := firebaseAuth.CreateUser(ctx, params); createErr != nil {
					log.Printf("EmailSignUpHandler: CreateUser failed: %v", createErr)
					apiresp.Error(c, http.StatusInternalServerError, "create_user_failed",
						"could not create account")
					return
				}
			} else {
				log.Printf("EmailSignUpHandler: GetUserByEmail error: %v", err)
				apiresp.Error(c, http.StatusInternalServerError, "firebase_error",
					"could not check existing accounts")
				return
			}
		} else {
			// ── Email already registered ──────────────────────────────────────
			// Check if this account already has email/password as a provider.
			for _, p := range existingUser.ProviderUserInfo {
				if p.ProviderID == "password" {
					apiresp.Error(c, http.StatusConflict, "email_already_registered",
						"an account with this email already exists — please sign in instead")
					return
				}
			}
			// Link email/password credentials to the existing account (e.g. the user
			// previously signed up with Google). The Firebase UID — and therefore the
			// DB record — remains the same, preserving all user data.
			params := (&fbauth.UserToUpdate{}).Password(req.Password)
			if _, updateErr := firebaseAuth.UpdateUser(ctx, existingUser.UID, params); updateErr != nil {
				log.Printf("EmailSignUpHandler: UpdateUser (link password) failed for %s: %v",
					existingUser.UID, updateErr)
				apiresp.Error(c, http.StatusInternalServerError, "link_failed",
					"could not link email/password to your existing account")
				return
			}
		}

		// ── Step 2: sign in immediately to obtain an ID token ─────────────────
		idToken, err := firebaseSignInWithPassword(ctx, req.Email, req.Password)
		if err != nil {
			log.Printf("EmailSignUpHandler: sign-in after create/link failed: %v", err)
			apiresp.Error(c, http.StatusInternalServerError, "signin_after_signup_failed",
				"account created but could not obtain token — try signing in")
			return
		}

		// ── Step 3: verify token + upsert user in DB ──────────────────────────
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
			log.Printf("EmailSignUpHandler: UpsertUser failed for %s: %v", token.UID, dbErr)
			// Non-fatal — auth succeeded.
		}

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

// EmailSignInHandler — POST /auth/email/signin
func EmailSignInHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ── Local dev bypass ─────────────────────────────────────────────────
		if os.Getenv("ENV") == "local" && firebaseAuth == nil {
			apiresp.OK(c, gin.H{
				"access_token": "dev-email-token",
				"token_type":   "bearer",
				"user": gin.H{
					"id": "local-dev", "firebase_uid": "local-dev",
					"email": "dev@local.dev", "provider": "password",
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
			Email    string `json:"email" binding:"required,email"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		ctx := c.Request.Context()

		// ── Step 1: sign in via Firebase REST API ─────────────────────────────
		idToken, err := firebaseSignInWithPassword(ctx, req.Email, req.Password)
		if err != nil {
			msg := err.Error()
			code := "invalid_credentials"
			status := http.StatusUnauthorized

			switch {
			case strings.Contains(msg, "EMAIL_NOT_FOUND"),
				strings.Contains(msg, "INVALID_EMAIL"):
				code = "email_not_found"
			case strings.Contains(msg, "INVALID_PASSWORD"),
				strings.Contains(msg, "INVALID_LOGIN_CREDENTIALS"),
				strings.Contains(msg, "WRONG_PASSWORD"):
				code = "invalid_password"
			case strings.Contains(msg, "USER_DISABLED"):
				code = "user_disabled"
			case strings.Contains(msg, "TOO_MANY_ATTEMPTS_TRY_LATER"):
				code = "too_many_attempts"
				status = http.StatusTooManyRequests
			case strings.Contains(msg, "FIREBASE_WEB_API_KEY"):
				code = "service_unavailable"
				status = http.StatusServiceUnavailable
			}

			// Return a generic message to avoid leaking user-existence info.
			apiresp.Error(c, status, code, "invalid email or password")
			return
		}

		// ── Step 2: verify token + upsert user in DB ──────────────────────────
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
			log.Printf("EmailSignInHandler: UpsertUser failed for %s: %v", token.UID, dbErr)
		}
		// ── Analytics: increment login counter ───────────────────────────────
		go analytics.TrackLoginSuccess(context.Background(), token.UID, email)
		// ── Webhook: notify dashboard to invalidate cache ───────────────────
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

// EmailForgotPasswordHandler — POST /auth/email/forgot-password
func EmailForgotPasswordHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email string `json:"email" binding:"required,email"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}

		if err := firebaseSendPasswordResetEmail(c.Request.Context(), req.Email); err != nil {
			// Log the real error server-side but never expose it to the caller —
			// this prevents leaking whether the email address is registered.
			log.Printf("EmailForgotPasswordHandler: sendOobCode failed for %s: %v", req.Email, err)
		}

		apiresp.OK(c, gin.H{
			"message": "if an account with that email exists, a password reset link has been sent",
		})
	}
}
