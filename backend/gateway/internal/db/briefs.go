package db

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/models"
)

// UpsertBusinessBrief creates (or resets) the brief row for a paper and returns its ID.
func UpsertBusinessBrief(ctx context.Context, pool *pgxpool.Pool, paperID, userID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO business_briefs (paper_id, user_id, status)
        VALUES ($1, $2, 'processing')
        ON CONFLICT (paper_id) DO UPDATE
          SET status        = 'processing',
              error_message = NULL,
              updated_at    = NOW()
        RETURNING id
    `, paperID, userID).Scan(&id)
	return id, err
}

// GetBusinessBriefByPaper retrieves the brief row for a paper.
func GetBusinessBriefByPaper(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID) (*models.BusinessBrief, error) {
	return getBusinessBrief(ctx, pool, "paper_id = $1", paperID)
}

// GetBusinessBrief retrieves the brief row by its own id.
func GetBusinessBrief(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*models.BusinessBrief, error) {
	return getBusinessBrief(ctx, pool, "id = $1", id)
}

func getBusinessBrief(ctx context.Context, pool *pgxpool.Pool, where string, arg any) (*models.BusinessBrief, error) {
	var b models.BusinessBrief
	var sectionsRaw []byte
	var jsonPath, pdfPath, errMsg, modelVer *string
	err := pool.QueryRow(ctx, `
        SELECT id, paper_id, user_id, status, sections, model_version,
               json_gcs_path, pdf_gcs_path, error_message,
               created_at, updated_at
        FROM business_briefs WHERE `+where,
		arg,
	).Scan(&b.ID, &b.PaperID, &b.UserID, &b.Status, &sectionsRaw, &modelVer,
		&jsonPath, &pdfPath, &errMsg, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	b.Sections = map[string]string{}
	if len(sectionsRaw) > 0 {
		_ = json.Unmarshal(sectionsRaw, &b.Sections)
	}
	if modelVer != nil {
		b.ModelVersion = *modelVer
	}
	if jsonPath != nil {
		b.JSONGCSPath = *jsonPath
	}
	if pdfPath != nil {
		b.PDFGCSPath = *pdfPath
	}
	if errMsg != nil {
		b.ErrorMessage = *errMsg
	}
	return &b, nil
}

// CompleteBusinessBrief writes the sections + GCS paths on successful generation.
func CompleteBusinessBrief(
	ctx context.Context,
	pool *pgxpool.Pool,
	id uuid.UUID,
	sections map[string]string,
	modelVersion, jsonPath, pdfPath string,
) error {
	sectionsRaw, err := json.Marshal(sections)
	if err != nil {
		return err
	}
	if modelVersion == "" {
		modelVersion = "v1"
	}
	_, err = pool.Exec(ctx, `
        UPDATE business_briefs
        SET status        = 'completed',
            sections      = $1::jsonb,
            model_version = $2,
            json_gcs_path = $3,
            pdf_gcs_path  = $4,
            error_message = NULL,
            updated_at    = NOW()
        WHERE id = $5
    `, sectionsRaw, modelVersion, jsonPath, pdfPath, id)
	return err
}

// FailBusinessBrief records a failure so the frontend can surface it.
func FailBusinessBrief(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, errMsg string) error {
	_, err := pool.Exec(ctx, `
        UPDATE business_briefs
        SET status        = 'failed',
            error_message = $1,
            updated_at    = NOW()
        WHERE id = $2
    `, errMsg, id)
	return err
}

// UpdateBusinessBriefSections stores user-edited sections and marks the PDF as stale.
func UpdateBusinessBriefSections(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, sections map[string]string) error {
	raw, err := json.Marshal(sections)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `
        UPDATE business_briefs
        SET sections     = $1::jsonb,
            pdf_gcs_path = NULL,
            status       = 'processing',
            updated_at   = NOW()
        WHERE id = $2
    `, raw, id)
	return err
}

// SetBusinessBriefPDF updates only the PDF path after a re-render job.
func SetBusinessBriefPDF(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, pdfPath string) error {
	_, err := pool.Exec(ctx, `
        UPDATE business_briefs
        SET pdf_gcs_path = $1,
            status       = 'completed',
            updated_at   = NOW()
        WHERE id = $2
    `, pdfPath, id)
	return err
}

// SetBusinessBriefScript saves Gemini-generated sections and JSON GCS path,
// keeping status as 'processing' until the PDF render completes.
func SetBusinessBriefScript(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, sections map[string]string, modelVersion, jsonPath string) error {
	raw, err := json.Marshal(sections)
	if err != nil {
		return err
	}
	if modelVersion == "" {
		modelVersion = "v2"
	}
	_, err = pool.Exec(ctx, `
        UPDATE business_briefs
        SET sections      = $1::jsonb,
            model_version = $2,
            json_gcs_path = $3,
            pdf_gcs_path  = NULL,
            status        = 'processing',
            error_message = NULL,
            updated_at    = NOW()
        WHERE id = $4
    `, raw, modelVersion, jsonPath, id)
	return err
}
