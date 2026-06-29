package db

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/models"
)

// LinkedInConnection bundles the tokens plus the cached person URN for share time.
type LinkedInConnection struct {
	Tokens    models.OAuthTokens
	PersonURN string
}

// SaveYouTubeTokens stores YouTube OAuth tokens on the user row.
func SaveYouTubeTokens(ctx context.Context, pool *pgxpool.Pool, firebaseUID, accessToken, refreshToken string, expiry time.Time) error {
	_, err := pool.Exec(ctx, `
        UPDATE users
        SET youtube_access_token = $1, youtube_refresh_token = $2, youtube_token_expiry = $3
        WHERE firebase_uid = $4
    `, accessToken, refreshToken, expiry, firebaseUID)
	return err
}

// GetYouTubeTokens retrieves stored YouTube OAuth tokens for a user.
func GetYouTubeTokens(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (*models.OAuthTokens, error) {
	var t models.OAuthTokens
	err := pool.QueryRow(ctx, `
        SELECT COALESCE(youtube_access_token, ''),
               COALESCE(youtube_refresh_token, ''),
               COALESCE(youtube_token_expiry, '1970-01-01'::timestamptz)
        FROM users WHERE id = $1
    `, userID).Scan(&t.AccessToken, &t.RefreshToken, &t.Expiry)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateYouTubeAccessToken updates the access token and expiry after a refresh.
func UpdateYouTubeAccessToken(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, accessToken string, expiry time.Time) error {
	_, err := pool.Exec(ctx, `
        UPDATE users
        SET youtube_access_token = $1, youtube_token_expiry = $2
        WHERE id = $3
    `, accessToken, expiry, userID)
	return err
}

// SaveLinkedInTokens stores LinkedIn OAuth tokens + the member's person URN.
func SaveLinkedInTokens(ctx context.Context, pool *pgxpool.Pool, firebaseUID, accessToken, refreshToken, personURN string, expiry time.Time) error {
	_, err := pool.Exec(ctx, `
        UPDATE users
        SET linkedin_access_token  = $1,
            linkedin_refresh_token = $2,
            linkedin_token_expiry  = $3,
            linkedin_person_urn    = $4
        WHERE firebase_uid = $5
    `, accessToken, refreshToken, expiry, personURN, firebaseUID)
	return err
}

// GetLinkedInConnection retrieves stored LinkedIn OAuth tokens and person URN for a user.
func GetLinkedInConnection(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (*LinkedInConnection, error) {
	var conn LinkedInConnection
	err := pool.QueryRow(ctx, `
        SELECT COALESCE(linkedin_access_token, ''),
               COALESCE(linkedin_refresh_token, ''),
               COALESCE(linkedin_token_expiry, '1970-01-01'::timestamptz),
               COALESCE(linkedin_person_urn, '')
        FROM users WHERE id = $1
    `, userID).Scan(&conn.Tokens.AccessToken, &conn.Tokens.RefreshToken, &conn.Tokens.Expiry, &conn.PersonURN)
	if err != nil {
		return nil, err
	}
	return &conn, nil
}

// UpdateLinkedInAccessToken updates the access token + expiry after a refresh.
func UpdateLinkedInAccessToken(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, accessToken, refreshToken string, expiry time.Time) error {
	_, err := pool.Exec(ctx, `
        UPDATE users
        SET linkedin_access_token  = $1,
            linkedin_refresh_token = $2,
            linkedin_token_expiry  = $3
        WHERE id = $4
    `, accessToken, refreshToken, expiry, userID)
	return err
}
