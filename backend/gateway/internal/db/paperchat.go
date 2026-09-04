package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/models"
)

// CreateChatSession inserts a new chat session for a paper.
func CreateChatSession(ctx context.Context, pool *pgxpool.Pool, paperID, userID uuid.UUID, title string) (uuid.UUID, error) {
	var sessionID uuid.UUID
	if title == "" {
		title = "Chat Session"
	}
	err := pool.QueryRow(ctx, `
		INSERT INTO paper_chat_sessions (paper_id, user_id, title)
		VALUES ($1, $2, $3)
		RETURNING id
	`, paperID, userID, title).Scan(&sessionID)
	return sessionID, err
}

// GetChatSession retrieves a chat session by ID.
func GetChatSession(ctx context.Context, pool *pgxpool.Pool, sessionID uuid.UUID) (*models.ChatSession, error) {
	var s models.ChatSession
	err := pool.QueryRow(ctx, `
		SELECT id, paper_id, user_id, title, created_at, updated_at
		FROM paper_chat_sessions
		WHERE id = $1
	`, sessionID).Scan(&s.ID, &s.PaperID, &s.UserID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ListChatSessions returns all chat sessions for a paper belonging to a user, newest updated first.
func ListChatSessions(ctx context.Context, pool *pgxpool.Pool, paperID, userID uuid.UUID) ([]models.ChatSession, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, paper_id, user_id, title, created_at, updated_at
		FROM paper_chat_sessions
		WHERE paper_id = $1 AND user_id = $2
		ORDER BY updated_at DESC
	`, paperID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]models.ChatSession, 0)
	for rows.Next() {
		var s models.ChatSession
		if err := rows.Scan(&s.ID, &s.PaperID, &s.UserID, &s.Title, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

// TouchChatSession updates updated_at for a chat session and optionally updates title.
func TouchChatSession(ctx context.Context, pool *pgxpool.Pool, sessionID uuid.UUID, title ...string) error {
	if len(title) > 0 && title[0] != "" {
		_, err := pool.Exec(ctx, `
			UPDATE paper_chat_sessions
			SET updated_at = NOW(), title = $2
			WHERE id = $1
		`, sessionID, title[0])
		return err
	}
	_, err := pool.Exec(ctx, `
		UPDATE paper_chat_sessions
		SET updated_at = NOW()
		WHERE id = $1
	`, sessionID)
	return err
}

// SaveChatMessage inserts a message (user or assistant) into a session and updates the session timestamp.
func SaveChatMessage(ctx context.Context, pool *pgxpool.Pool, sessionID uuid.UUID, role, content string) (*models.ChatMessage, error) {
	var msg models.ChatMessage
	err := pool.QueryRow(ctx, `
		INSERT INTO paper_chat_messages (session_id, role, content, created_at)
		VALUES ($1, $2, $3, NOW())
		RETURNING id, session_id, role, content, created_at
	`, sessionID, role, content).Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Content, &msg.CreatedAt)
	if err != nil {
		return nil, err
	}

	_ = TouchChatSession(ctx, pool, sessionID)
	return &msg, nil
}

// GetChatMessages returns messages for a session in chronological order.
// If limit > 0, returns at most limit most recent messages.
func GetChatMessages(ctx context.Context, pool *pgxpool.Pool, sessionID uuid.UUID, limit int) ([]models.ChatMessage, error) {
	var query string
	var args []interface{}

	if limit > 0 {
		query = `
			SELECT id, session_id, role, content, created_at
			FROM (
				SELECT id, session_id, role, content, created_at
				FROM paper_chat_messages
				WHERE session_id = $1
				ORDER BY created_at DESC
				LIMIT $2
			) sub
			ORDER BY created_at ASC
		`
		args = []interface{}{sessionID, limit}
	} else {
		query = `
			SELECT id, session_id, role, content, created_at
			FROM paper_chat_messages
			WHERE session_id = $1
			ORDER BY created_at ASC
		`
		args = []interface{}{sessionID}
	}

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]models.ChatMessage, 0)
	for rows.Next() {
		var m models.ChatMessage
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}
