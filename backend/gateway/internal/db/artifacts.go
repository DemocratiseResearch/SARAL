package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func InsertArtifact(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, artifactType, gcsPath string) error {
	_, err := pool.Exec(ctx, `
        INSERT INTO artifacts (run_id, artifact_type, gcs_path)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
    `, runID, artifactType, gcsPath)
	return err
}

func GetArtifact(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, artifactType string) (string, error) {
	var gcsPath string
	err := pool.QueryRow(ctx, `
        SELECT gcs_path FROM artifacts
        WHERE run_id = $1 AND artifact_type = $2
        ORDER BY created_at DESC LIMIT 1
    `, runID, artifactType).Scan(&gcsPath)
	return gcsPath, err
}
