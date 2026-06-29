package pipeline

import (
	"context"
	"fmt"

	goredis "github.com/redis/go-redis/v9"

	redisx "github.com/saral/gateway/internal/redis"
)


func TriggerFFmpeg(ctx context.Context, rdb *goredis.Client, runID string, jobData redisx.JobData) error {
	jobData["run_id"] = runID
	if _, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamFFmpeg, jobData); err != nil {
		return fmt.Errorf("enqueue ffmpeg job: %w", err)
	}
	return nil
}
