package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/gemini"
	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/storage"
)

// getChatUserID extracts the authenticated user ID from context or dev header.
// Matches getBriefUserID in businessbrief.go exactly.
func getChatUserID(c *gin.Context, pool *pgxpool.Pool) uuid.UUID {
	if uid := c.GetHeader("X-User-ID"); uid != "" {
		if id, err := uuid.Parse(uid); err == nil {
			return id
		}
		id, _ := db.GetUserByFirebaseUID(c.Request.Context(), pool, uid)
		return id
	}
	firebaseUID, _ := c.Get("firebase_uid")
	if s, ok := firebaseUID.(string); ok && s != "" {
		id, _ := db.GetUserByFirebaseUID(c.Request.Context(), pool, s)
		return id
	}
	return uuid.Nil
}

// checkChatRateLimit checks a per-user counter in Redis (max 20 requests/minute).
// Fails open if Redis is nil or returns an error.
func checkChatRateLimit(ctx context.Context, rdb *goredis.Client, userID uuid.UUID) error {
	if rdb == nil {
		return nil
	}

	key := fmt.Sprintf("ratelimit:chat:%s", userID.String())
	count, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		log.Printf("chat rate limit redis error (failing open): %v", err)
		return nil
	}

	if count == 1 {
		_ = rdb.Expire(ctx, key, 60*time.Second).Err()
	}

	if count > 20 {
		return fmt.Errorf("rate limit exceeded: please wait a minute before sending more questions")
	}

	return nil
}

// PaperChatHandler handles synchronous Q&A queries for an uploaded paper.
func PaperChatHandler(pool *pgxpool.Pool, rdb *goredis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getChatUserID(c, pool)
		if userID == uuid.Nil {
			apiresp.Error(c, http.StatusUnauthorized, "unauthorized", "user not found")
			return
		}

		// Verify paper ownership
		owner, err := db.GetPaperOwner(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		if owner != userID {
			apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
			return
		}

		// Rate limit check
		if err := checkChatRateLimit(ctx, rdb, userID); err != nil {
			apiresp.Error(c, http.StatusTooManyRequests, "rate_limit_exceeded", err.Error())
			return
		}

		// Validate request body
		var req models.ChatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", "message is required")
			return
		}
		cleanMessage := strings.TrimSpace(req.Message)
		if cleanMessage == "" {
			apiresp.Error(c, http.StatusBadRequest, "invalid_request", "message cannot be empty")
			return
		}

		// Locate extracted text
		textPath, err := db.GetExtractedTextPath(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusConflict, "paper_not_ready", "paper text not extracted yet — run the pipeline first")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		// Download text from GCS
		rawBytes, err := storage.DownloadJSON(ctx, textPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "storage_error", "failed to read paper text from storage")
			return
		}

		paperText := strings.TrimSpace(string(rawBytes))
		var doc models.ExtractedDocument
		if err := json.Unmarshal(rawBytes, &doc); err == nil && doc.Text != "" {
			paperText = strings.TrimSpace(doc.Text)
		}

		if paperText == "" {
			apiresp.Error(c, http.StatusConflict, "paper_empty", "extracted paper text is empty")
			return
		}

		// Resolve or create session
		var sessionID uuid.UUID
		if req.SessionID == nil || *req.SessionID == uuid.Nil {
			title := cleanMessage
			if len(title) > 40 {
				title = title[:40] + "..."
			}
			newID, err := db.CreateChatSession(ctx, pool, paperID, userID, title)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to create chat session")
				return
			}
			sessionID = newID
		} else {
			session, err := db.GetChatSession(ctx, pool, *req.SessionID)
			if err != nil || session.UserID != userID || session.PaperID != paperID {
				apiresp.Error(c, http.StatusNotFound, "session_not_found", "chat session not found")
				return
			}
			sessionID = session.ID
		}

		// Load recent conversation history (last 10 turns)
		history, err := db.GetChatMessages(ctx, pool, sessionID, 10)
		if err != nil {
			log.Printf("failed to load chat history (continuing): %v", err)
			history = nil
		}

		// Retrieve user's custom API key if configured
		geminiKey, _, _ := db.GetUserKeys(ctx, pool, userID)

		// Call Gemini with grounded instructions
		reply, err := gemini.GenerateChat(ctx, paperText, history, cleanMessage, geminiKey)
		if err != nil {
			log.Printf("gemini chat error for paper %s: %v", paperID, err)
			apiresp.Error(c, http.StatusInternalServerError, "llm_error", "failed to generate answer from paper")
			return
		}

		// Persist user question and assistant answer
		if _, err := db.SaveChatMessage(ctx, pool, sessionID, "user", cleanMessage); err != nil {
			log.Printf("failed to save user chat message: %v", err)
		}

		assistantMsg, err := db.SaveChatMessage(ctx, pool, sessionID, "assistant", reply)
		if err != nil {
			log.Printf("failed to save assistant chat message: %v", err)
			apiresp.Error(c, http.StatusInternalServerError, "db_error", "failed to save answer")
			return
		}

		apiresp.OK(c, models.ChatResponse{
			SessionID: sessionID,
			Message:   *assistantMsg,
		})
	}
}

// PaperChatSessionsHandler returns all chat sessions for a paper.
func PaperChatSessionsHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		userID := getChatUserID(c, pool)
		if userID == uuid.Nil {
			apiresp.Error(c, http.StatusUnauthorized, "unauthorized", "user not found")
			return
		}

		owner, err := db.GetPaperOwner(ctx, pool, paperID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}
		if owner != userID {
			apiresp.Error(c, http.StatusNotFound, "paper_not_found", "paper not found")
			return
		}

		sessions, err := db.ListChatSessions(ctx, pool, paperID, userID)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		apiresp.OK(c, sessions)
	}
}

// PaperChatMessagesHandler returns the message history for a given session.
func PaperChatMessagesHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id format")
			return
		}

		sessionID, err := uuid.Parse(c.Param("session_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_session_id", "invalid session_id format")
			return
		}

		userID := getChatUserID(c, pool)
		if userID == uuid.Nil {
			apiresp.Error(c, http.StatusUnauthorized, "unauthorized", "user not found")
			return
		}

		session, err := db.GetChatSession(ctx, pool, sessionID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apiresp.Error(c, http.StatusNotFound, "session_not_found", "chat session not found")
				return
			}
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		if session.UserID != userID || session.PaperID != paperID {
			apiresp.Error(c, http.StatusNotFound, "session_not_found", "chat session not found")
			return
		}

		messages, err := db.GetChatMessages(ctx, pool, sessionID, 0)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "db_error", err.Error())
			return
		}

		apiresp.OK(c, messages)
	}
}
