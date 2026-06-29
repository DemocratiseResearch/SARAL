package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)


type StepReplayRow struct {
	ID       uuid.UUID
	StepName string
	Status   string
	ErrorMsg string
}


func GetStepsForReplay(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, afterStepID string) ([]StepReplayRow, string, error) {
	afterID, parseErr := uuid.Parse(afterStepID)

	var (
		querySQL  string
		queryArgs []any
	)

	if parseErr != nil {
		querySQL = `
            SELECT id, step_name::text, status::text, COALESCE(error_message, '')
            FROM pipeline_steps
            WHERE run_id = $1
            ORDER BY started_at ASC, id ASC`
		queryArgs = []any{runID}
	} else {
		querySQL = `
            SELECT id, step_name::text, status::text, COALESCE(error_message, '')
            FROM pipeline_steps
            WHERE run_id = $1
              AND (
                id = $2
                OR started_at > (
                    SELECT started_at FROM pipeline_steps
                    WHERE id = $2 AND run_id = $1
                )
              )
            ORDER BY started_at ASC, id ASC`
		queryArgs = []any{runID, afterID}
	}

	rows, err := pool.Query(ctx, querySQL, queryArgs...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var result []StepReplayRow
	for rows.Next() {
		var r StepReplayRow
		if err := rows.Scan(&r.ID, &r.StepName, &r.Status, &r.ErrorMsg); err != nil {
			return nil, "", err
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	var runStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM pipeline_runs WHERE id = $1`, runID).Scan(&runStatus)

	return result, runStatus, nil
}
