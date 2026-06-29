package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/models"
)

func CreatePipelineRun(ctx context.Context, pool *pgxpool.Pool, paperID, userID uuid.UUID, mode string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO pipeline_runs (paper_id, user_id, status, mode)
        VALUES ($1, $2, 'pending', $3)
        RETURNING id
    `, paperID, userID, mode).Scan(&id)
	return id, err
}

func GetRun(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) (*models.Run, error) {
	row := &models.Run{}
	err := pool.QueryRow(ctx, `
        SELECT id, paper_id, user_id, status::text,
               COALESCE(current_step::text, ''),
               COALESCE(error_message, ''),
               COALESCE(audience_level, 'intermediate'),
               COALESCE(tone, 'formal'),
               started_at, updated_at, completed_at
        FROM pipeline_runs WHERE id = $1
    `, runID).Scan(
		&row.ID, &row.PaperID, &row.UserID,
		&row.Status, &row.CurrentStep, &row.ErrorMsg,
		&row.AudienceLevel, &row.Tone,
		&row.StartedAt, &row.UpdatedAt, &row.CompletedAt,
	)
	if err != nil {
		return row, err
	}

	rows, err := pool.Query(ctx, `
        SELECT step_name::text, status::text, COALESCE(error_message, ''),
               started_at, completed_at
        FROM pipeline_steps
        WHERE run_id = $1
        ORDER BY started_at ASC
    `, runID)
	if err != nil {
		return row, err
	}
	defer rows.Close()

	for rows.Next() {
		var step models.StepStatus
		if err := rows.Scan(&step.Name, &step.Status, &step.ErrorMsg, &step.StartedAt, &step.CompletedAt); err != nil {
			return row, err
		}
		row.Steps = append(row.Steps, step)
	}

	return row, rows.Err()
}

// FindGenerateVideoSourceRun resolves :run_id as either a pipeline_runs.id or,
// if no such run exists, as papers.id for a paper owned by userID.
func FindGenerateVideoSourceRun(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, userID uuid.UUID) (*models.Run, error) {
	run, err := GetRun(ctx, pool, id)
	if err == nil {
		if run.UserID != userID {
			return nil, pgx.ErrNoRows
		}
		return run, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var runID uuid.UUID
	err = pool.QueryRow(ctx, `
        SELECT pr.id
        FROM pipeline_runs pr
        INNER JOIN papers p ON p.id = pr.paper_id
        WHERE p.id = $1 AND p.user_id = $2
          AND COALESCE(pr.mode, 'video') = 'video'
        ORDER BY pr.started_at DESC
        LIMIT 1
    `, id, userID).Scan(&runID)
	if err != nil {
		return nil, err
	}
	return GetRun(ctx, pool, runID)
}

// FindReusableVideoRun returns the most recent non-failed video run for a
// given (paper, audience) tuple, plus the status of its script_gen step.
// Used by GenerateVideoHandler to deduplicate repeated clicks.
func FindReusableVideoRun(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID, audience string) (uuid.UUID, string, error) {
	var runID uuid.UUID
	var scriptStatus string
	err := pool.QueryRow(ctx, `
        SELECT pr.id,
               COALESCE(
                   (SELECT ps.status::text FROM pipeline_steps ps
                    WHERE ps.run_id = pr.id
                      AND ps.step_name = 'script_gen'::step_name_enum
                    ORDER BY ps.started_at DESC LIMIT 1),
                   ''
               )
        FROM pipeline_runs pr
        WHERE pr.paper_id = $1
          AND pr.audience_level = $2
          AND pr.mode = 'video'
          AND pr.status != 'failed'
        ORDER BY pr.started_at DESC
        LIMIT 1
    `, paperID, audience).Scan(&runID, &scriptStatus)
	return runID, scriptStatus, err
}

// SetRunAudienceTone persists the user-selected audience_level and tone on a run.
func SetRunAudienceTone(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, audience, tone string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET audience_level = $1,
            tone           = $2,
            updated_at     = NOW()
        WHERE id = $3
    `, audience, tone, runID)
	return err
}

func CompleteRun(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1
    `, runID)
	return err
}

func FailRun(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, errMsg string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET status = 'failed', error_message = $1, updated_at = NOW()
        WHERE id = $2
    `, errMsg, runID)
	return err
}

// FailRunWithStep marks a run as failed, records the step that was in progress.
func FailRunWithStep(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, failedStep, errMsg string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET status        = 'failed',
            error_message = $1,
            failed_step   = $2,
            updated_at    = NOW()
        WHERE id = $3
    `, errMsg, failedStep, runID)
	return err
}

// ResetRunForRetry sets a failed run back to 'processing' and clears failure fields.
func ResetRunForRetry(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs
        SET status        = 'processing',
            error_message = NULL,
            failed_step   = NULL,
            updated_at    = NOW()
        WHERE id = $1
    `, runID)
	return err
}

// GetRunMode returns the mode ('video', 'podcast', 'slides', etc.) of a pipeline run.
func GetRunMode(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) (string, error) {
	var mode string
	err := pool.QueryRow(ctx, `
        SELECT COALESCE(mode, 'video') FROM pipeline_runs WHERE id = $1
    `, runID).Scan(&mode)
	return mode, err
}

// SetSlidesTemplatePath stores a user-uploaded PPTX template path for a slides-mode run.
func SetSlidesTemplatePath(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID, gcsPath string) error {
	_, err := pool.Exec(ctx, `
        UPDATE pipeline_runs SET slides_template_gcs_path = $2, updated_at = NOW() WHERE id = $1
    `, runID, gcsPath)
	return err
}

// GetSlidesTemplatePath returns the optional custom PPTX template for this run (may be empty).
func GetSlidesTemplatePath(ctx context.Context, pool *pgxpool.Pool, runID uuid.UUID) (string, error) {
	var ns *string
	err := pool.QueryRow(ctx, `
        SELECT slides_template_gcs_path FROM pipeline_runs WHERE id = $1
    `, runID).Scan(&ns)
	if err != nil {
		return "", err
	}
	if ns == nil {
		return "", nil
	}
	return *ns, nil
}
