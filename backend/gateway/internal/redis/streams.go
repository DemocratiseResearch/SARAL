package redis

import (
	"context"
	"os"

	goredis "github.com/redis/go-redis/v9"
)

const (
	StreamPDF    = "saral:jobs:pdf"
	StreamScript = "saral:jobs:script"
	StreamLaTeX  = "saral:jobs:latex"
	StreamBeamer = StreamLaTeX
	StreamFFmpeg = "saral:jobs:ffmpeg"
	StreamAudio  = "saral:jobs:audio"
	StreamBusinessBrief = "saral:jobs:business_brief"
	StreamPoster        = "saral:jobs:poster"
	DLQStream    = "saral:dlq"
	GroupName    = "saral-workers"
)

func NewClient() *goredis.Client {
	opt, _ := goredis.ParseURL(os.Getenv("REDIS_URL"))
	return goredis.NewClient(opt)
}

func EnsureConsumerGroups(ctx context.Context, rdb *goredis.Client) {
	streams := []string{StreamPDF, StreamScript, StreamLaTeX, StreamFFmpeg, StreamAudio, StreamPoster, StreamBusinessBrief}
	for _, s := range streams {
		err := rdb.XGroupCreateMkStream(ctx, s, GroupName, "0").Err()
		if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
			// Log but don't fatal — existing groups are fine
			_ = err
		}
	}
}

// JobData is the payload for a Redis stream job.
type JobData map[string]string

// EnqueueJob adds a message to a Redis Stream.
func EnqueueJob(ctx context.Context, rdb *goredis.Client, stream string, values JobData) (string, error) {
	v := make(map[string]interface{}, len(values))
	for k, val := range values {
		v[k] = val
	}
	id, err := rdb.XAdd(ctx, &goredis.XAddArgs{
		Stream: stream,
		Values: v,
		ID:     "*",
	}).Result()
	return id, err
}
