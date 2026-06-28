package redis

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/db"
)


func StartJanitor(ctx context.Context, rdb *goredis.Client, pool *pgxpool.Pool) {
	streams := []string{StreamPDF, StreamScript, StreamLaTeX, StreamAudio, StreamFFmpeg, StreamPoster, StreamBusinessBrief}
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	log.Println("Janitor started — checking for stuck jobs every 60s")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, stream := range streams {
				reclaimStuckMessages(ctx, rdb, pool, stream)
			}
		}
	}
}

func reclaimStuckMessages(ctx context.Context, rdb *goredis.Client, pool *pgxpool.Pool, stream string) {

	messages, _, err := rdb.XAutoClaim(ctx, &goredis.XAutoClaimArgs{
		Stream:   stream,
		Group:    GroupName,
		Consumer: "janitor",
		MinIdle:  5 * time.Minute,
		Start:    "0-0",
		Count:    10,
	}).Result()
	if err != nil {
		log.Printf("Janitor XAUTOCLAIM error on %s: %v", stream, err)
		return
	}
	if len(messages) == 0 {
		return
	}

	log.Printf("Janitor: reclaimed %d stuck message(s) from %s", len(messages), stream)

	for _, msg := range messages {
		runID, _ := msg.Values["run_id"].(string)

		log.Printf("Janitor: marking run %s failed (stream=%s msg=%s)", runID, stream, msg.ID)

		// Determine which step was in-progress from the job payload if present,
		// otherwise fall back to the DB's current_step column.
		failedStep, _ := msg.Values["step_name"].(string)

		// Mark the run as failed in Postgres so the SSE stream and status API
		// reflect the failure immediately.  The frontend will show a retry button.
		if runID != "" {
			if err := db.FailRunWithStep(ctx, pool,
				mustParseUUID(runID),
				failedStep,
				"worker crashed or timed out",
			); err != nil {
				log.Printf("Janitor: FailRunWithStep error for run %s: %v", runID, err)
			}
		}

		// Archive the raw message in the DLQ for debugging / replay.
		rdb.XAdd(ctx, &goredis.XAddArgs{
			Stream: DLQStream,
			Values: msg.Values,
			ID:     "*",
		})

		// Acknowledge so the message leaves the PEL and won't be reclaimed again.
		rdb.XAck(ctx, stream, GroupName, msg.ID)
	}
}

func mustParseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}

