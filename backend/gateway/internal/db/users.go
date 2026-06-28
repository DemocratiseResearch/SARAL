package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/keycrypt"
)


func UpsertUser(ctx context.Context, pool *pgxpool.Pool, firebaseUID, email, provider string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO users (firebase_uid, email, last_sign_in_provider)
        VALUES ($1, $2, $3)
        ON CONFLICT (firebase_uid) DO UPDATE
            SET email = EXCLUDED.email,
                last_sign_in_provider = EXCLUDED.last_sign_in_provider
        RETURNING id
    `, firebaseUID, email, provider).Scan(&id)
	return id, err
}


func GetUserKeys(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (geminiKey, sarvamKey string, err error) {
	var rawGemini, rawSarvam string
	err = pool.QueryRow(ctx, `
        SELECT COALESCE(gemini_key, ''), COALESCE(sarvam_key, '')
        FROM users WHERE id = $1
    `, userID).Scan(&rawGemini, &rawSarvam)
	if err != nil {
		return
	}
	geminiKey, err = keycrypt.Decrypt(rawGemini)
	if err != nil {
		return
	}
	sarvamKey, err = keycrypt.Decrypt(rawSarvam)
	return
}


func SetUserKeys(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, geminiKey, sarvamKey string) error {
	encGemini, err := keycrypt.Encrypt(geminiKey)
	if err != nil {
		return fmt.Errorf("encrypt gemini key: %w", err)
	}
	encSarvam, err := keycrypt.Encrypt(sarvamKey)
	if err != nil {
		return fmt.Errorf("encrypt sarvam key: %w", err)
	}

	var geminiVal, sarvamVal interface{}
	if encGemini != "" {
		geminiVal = encGemini
	}
	if encSarvam != "" {
		sarvamVal = encSarvam
	}

	_, err = pool.Exec(ctx, `
		UPDATE users SET gemini_key = $1, sarvam_key = $2 WHERE id = $3
	`, geminiVal, sarvamVal, userID)
	return err
}

// GetInternalUserID returns the internal UUID for a Firebase UID.
func GetInternalUserID(ctx context.Context, pool *pgxpool.Pool, firebaseUID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM users WHERE firebase_uid = $1`, firebaseUID).Scan(&id)
	return id, err
}

// GetUserFirebaseUID returns the Firebase UID for an internal postgres user UUID.
// Used by background goroutines that only have the postgres UUID but need the
// Firebase UID for dashboard webhook notifications.
func GetUserFirebaseUID(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (string, error) {
	var firebaseUID string
	err := pool.QueryRow(ctx, `SELECT firebase_uid FROM users WHERE id = $1`, userID).Scan(&firebaseUID)
	return firebaseUID, err
}

// GetUserByFirebaseUID returns the user ID for a Firebase UID.
func GetUserByFirebaseUID(ctx context.Context, pool *pgxpool.Pool, firebaseUID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        SELECT id FROM users WHERE firebase_uid = $1
    `, firebaseUID).Scan(&id)
	return id, err
}
