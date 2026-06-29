package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CreateStep inserts a pipeline_steps row for an upcoming step.
// Returns the step_id that gets embedded in the Redis message.
func CreateStep(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, stepName string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO pipeline_steps (run_id, step_name, status)
        VALUES ($1, $2::step_name_enum, 'pending')
        RETURNING id
    `, runID, stepName).Scan(&id)
	return id, err
}

func UpdateRunCurrentStep(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, step, status string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET current_step = $1::step_name_enum,
            status = $2::status_enum,
            updated_at = NOW()
        WHERE id = $3
    `, step, status, runID)
	return err
}

func CompleteStep(ctx context.Context, pool *pgxpool.Pool, stepID uuid.UUID, gcsPath string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_steps
        SET status = 'completed', gcs_output_path = $1, completed_at = NOW()
        WHERE id = $2
    `, gcsPath, stepID)
	return err
}

func FailStep(ctx context.Context, pool *pgxpool.Pool, stepID uuid.UUID, errMsg string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_steps
        SET status = 'failed', error_message = $1, completed_at = NOW()
        WHERE id = $2
    `, errMsg, stepID)
	return err
}

// GetStepOutput returns the gcs_output_path for the latest completed attempt of a step.
func GetStepOutput(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, stepName string) (string, error) {
	var gcsPath string
	err := pool.QueryRow(ctx, `
        SELECT gcs_output_path FROM pipeline_steps
        WHERE run_id = $1 AND step_name = $2::step_name_enum AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
    `, runID, stepName).Scan(&gcsPath)
	return gcsPath, err
}

// GetLatestStepOutputForPaper returns the most recent completed gcs_output_path
// for a given step_name across ALL runs belonging to a paper.
func GetLatestStepOutputForPaper(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID, stepName string) (string, error) {
	var gcsPath string
	err := pool.QueryRow(ctx, `
        SELECT ps.gcs_output_path
        FROM pipeline_steps ps
        JOIN pipeline_runs pr ON ps.run_id = pr.id
        WHERE pr.paper_id = $1
          AND ps.step_name = $2::step_name_enum
          AND ps.status = 'completed'
        ORDER BY ps.completed_at DESC
        LIMIT 1
    `, paperID, stepName).Scan(&gcsPath)
	return gcsPath, err
}

// CountCompletedSteps returns how many of the given step names are in 'completed'
// status for a run, considering only the most recent attempt of each step name.
func CountCompletedSteps(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, stepNames []string) (int, error) {
	var count int
	err := pool.QueryRow(ctx, `
        WITH latest AS (
            SELECT DISTINCT ON (step_name) step_name, status
            FROM pipeline_steps
            WHERE run_id = $1
              AND step_name::text = ANY($2)
            ORDER BY step_name, started_at DESC
        )
        SELECT COUNT(*) FROM latest WHERE status = 'completed'
    `, runID, stepNames).Scan(&count)
	return count, err
}

// HasInflightStep returns true if the given step has a pending or processing row.
// Used as an idempotency guard before enqueueing a step.
func HasInflightStep(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, stepName string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `
        SELECT EXISTS (
            SELECT 1 FROM pipeline_steps
            WHERE run_id = $1
              AND step_name = $2::step_name_enum
              AND status IN ('pending', 'processing')
        )
    `, runID, stepName).Scan(&exists)
	return exists, err
}

// GetExtractedJSONPathForRun resolves extracted.json for any pipeline run on a paper.
// Uses this run's pdf_extract output when present; falls back to latest for the paper.
func GetExtractedJSONPathForRun(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) (string, error) {
	path, err := GetStepOutput(ctx, pool, runID, "pdf_extract")
	if err == nil && path != "" {
		return path, nil
	}
	run, err := GetRun(ctx, pool, runID)
	if err != nil {
		return "", err
	}
	return GetLatestStepOutputForPaper(ctx, pool, run.PaperID, "pdf_extract")
}
