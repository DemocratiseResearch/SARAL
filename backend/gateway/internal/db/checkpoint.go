package db

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SaveCheckpoint merges new GCS paths into the run's checkpoint_data JSONB blob.
func SaveCheckpoint(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, data map[string]interface{}) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET checkpoint_data = COALESCE(checkpoint_data, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
    `, raw, runID)
	return err
}

// GetCheckpoint returns the failed_step and accumulated checkpoint_data for a run.
func GetCheckpoint(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) (failedStep string, data map[string]interface{}, err error) {
	var rawData []byte
	err = pool.QueryRow(ctx, `
        SELECT COALESCE(failed_step, current_step::text, ''),
               COALESCE(checkpoint_data, '{}'::jsonb)
        FROM pipeline_runs WHERE id = $1
    `, runID).Scan(&failedStep, &rawData)
	if err != nil {
		return
	}
	data = map[string]interface{}{}
	if len(rawData) > 0 {
		_ = json.Unmarshal(rawData, &data)
	}
	return
}
