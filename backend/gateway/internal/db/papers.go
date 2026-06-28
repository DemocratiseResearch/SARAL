package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/saral/gateway/internal/models"
)

func CreatePaper(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, gcsPath string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO papers (user_id, gcs_source_path)
        VALUES ($1, $2)
        RETURNING id
    `, userID, gcsPath).Scan(&id)
	return id, err
}

// CreatePaperWithSourceType is like CreatePaper but also sets the source_type
// column (e.g. "paper", "arxiv", "patent").
func CreatePaperWithSourceType(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, gcsPath, sourceType string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
        INSERT INTO papers (user_id, gcs_source_path, source_type)
        VALUES ($1, $2, $3)
        RETURNING id
    `, userID, gcsPath, sourceType).Scan(&id)
	return id, err
}

// GetPapersByUser fetches all papers belonging to a user.
func GetPapersByUser(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) ([]*models.Paper, error) {
	rows, err := pool.Query(ctx, `
        SELECT id, user_id, gcs_source_path, created_at,
               COALESCE(paper_title, ''), COALESCE(paper_authors, ''), COALESCE(paper_date, '')
        FROM papers
        WHERE user_id = $1
        ORDER BY created_at DESC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var papers []*models.Paper
	for rows.Next() {
		p := &models.Paper{}
		if err := rows.Scan(&p.ID, &p.UserID, &p.GCSSourcePath, &p.CreatedAt,
			&p.Title, &p.Authors, &p.Date); err != nil {
			return nil, err
		}
		papers = append(papers, p)
	}
	return papers, rows.Err()
}

// UpdatePaperMetadata stores extracted title, authors, and date on the papers table.
func UpdatePaperMetadata(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID, title, authors, date string) error {
	_, err := pool.Exec(ctx, `
        UPDATE papers
        SET paper_title = $1, paper_authors = $2, paper_date = $3
        WHERE id = $4
    `, title, authors, date, paperID)
	return err
}

// GetPaperMetadata retrieves the stored title and authors for a paper.
func GetPaperMetadata(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID) (title, authors string, err error) {
	err = pool.QueryRow(ctx, `
        SELECT COALESCE(paper_title, ''), COALESCE(paper_authors, '')
        FROM papers WHERE id = $1
    `, paperID).Scan(&title, &authors)
	return
}

// GetPaperOwner returns the user_id who owns the given paper.
func GetPaperOwner(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID) (uuid.UUID, error) {
	var uid uuid.UUID
	err := pool.QueryRow(ctx, `
        SELECT user_id FROM papers WHERE id = $1
    `, paperID).Scan(&uid)
	return uid, err
}

// GetPaperSourcePath returns the original gs:// PDF path stored when the paper was uploaded.
func GetPaperSourcePath(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID) (string, error) {
	var path string
	err := pool.QueryRow(ctx, `
        SELECT gcs_source_path FROM papers WHERE id = $1
    `, paperID).Scan(&path)
	return path, err
}

// GetExtractedTextPath returns the gs:// path for a paper's extracted text.
func GetExtractedTextPath(ctx context.Context, pool *pgxpool.Pool, paperID uuid.UUID) (string, error) {
	var path string
	err := pool.QueryRow(ctx, `
        SELECT a.gcs_path
        FROM artifacts a
        JOIN pipeline_runs pr ON pr.id = a.run_id
        WHERE pr.paper_id = $1
          AND a.artifact_type = 'pdf_extract'
        ORDER BY a.created_at DESC
        LIMIT 1
    `, paperID).Scan(&path)
	return path, err
}
