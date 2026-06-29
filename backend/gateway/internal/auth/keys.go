package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
)


func KeysGetHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := resolveUserID(c, pool)
		if !ok {
			return
		}

		geminiKey, sarvamKey, err := db.GetUserKeys(c.Request.Context(), pool, userID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to fetch keys")
			return
		}

		apiresp.OK(c, gin.H{
			"gemini_key_set":     geminiKey != "",
			"gemini_key_preview": maskKey(geminiKey),
			"sarvam_key_set":     sarvamKey != "",
			"sarvam_key_preview": maskKey(sarvamKey),
		})
	}
}


func KeysPutHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := resolveUserID(c, pool)
		if !ok {
			return
		}

		var req struct {
			GeminiKey *string `json:"gemini_key"`
			SarvamKey *string `json:"sarvam_key"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_body", "expected JSON with gemini_key and/or sarvam_key")
			return
		}
		if req.GeminiKey == nil && req.SarvamKey == nil {
			apiresp.Error(c, http.StatusBadRequest, "no_fields", "provide at least one of gemini_key or sarvam_key")
			return
		}

		ctx := c.Request.Context()

		// Fetch current values so we only overwrite what was sent.
		existingGemini, existingSarvam, err := db.GetUserKeys(ctx, pool, userID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to fetch existing keys")
			return
		}

		newGemini := existingGemini
		if req.GeminiKey != nil {
			newGemini = *req.GeminiKey
		}
		newSarvam := existingSarvam
		if req.SarvamKey != nil {
			newSarvam = *req.SarvamKey
		}

		if err := db.SetUserKeys(ctx, pool, userID, newGemini, newSarvam); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to save keys: "+err.Error())
			return
		}

		apiresp.OK(c, gin.H{
			"message":            "keys updated",
			"gemini_key_set":     newGemini != "",
			"gemini_key_preview": maskKey(newGemini),
			"sarvam_key_set":     newSarvam != "",
			"sarvam_key_preview": maskKey(newSarvam),
		})
	}
}

// resolveUserID converts the firebase_uid in the gin context to an internal DB UUID.
// Returns uuid.Nil and writes an error response if the user is not found.
func resolveUserID(c *gin.Context, pool *pgxpool.Pool) (uuid.UUID, bool) {
	firebaseUID, exists := c.Get("firebase_uid")
	if !exists {
		apiresp.Error(c, http.StatusUnauthorized, "missing_uid", "no uid in context")
		return uuid.Nil, false
	}
	uid, err := db.GetInternalUserID(c.Request.Context(), pool, firebaseUID.(string))
	if err != nil {
		apiresp.Error(c, http.StatusNotFound, "user_not_found", "user not found — please log in first")
		return uuid.Nil, false
	}
	return uid, true
}

// maskKey returns a string with the middle characters replaced by asterisks.
// Examples: "AIzaSyABCDEFGHIJKL" → "AIza**********HIJKL"
// Short keys (≤8 chars) are fully masked.
func maskKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return strings.Repeat("*", len(key))
	}
	return key[:4] + strings.Repeat("*", len(key)-8) + key[len(key)-4:]
}
