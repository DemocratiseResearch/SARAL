package db

import (
    "context"
    "os"

    "github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a connection pool to Postgres.
func NewPool(ctx context.Context) (*pgxpool.Pool, error) {
    dsn := os.Getenv("DATABASE_URL")
    
    config, err := pgxpool.ParseConfig(dsn)
    if err != nil {
        return nil, err
    }
    
    // Gateway can have many concurrent goroutines (one per SSE connection).
    config.MaxConns = 10
    config.MinConns = 2
    
    return pgxpool.NewWithConfig(ctx, config)
}