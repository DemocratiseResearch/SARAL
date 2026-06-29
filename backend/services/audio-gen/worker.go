package main

import (
	"context"
	"log"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

func ensureConsumerGroup(ctx context.Context) {
	err := rdb.XGroupCreateMkStream(ctx, streamName, groupName, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("XGroupCreateMkStream warning: %v", err)
	}
}

func startupSweep(ctx context.Context) {
	log.Println("[startup] XAUTOCLAIM sweep for orphaned messages")
	nextID := "0-0"
	for {
		msgs, nextStartID, err := rdb.XAutoClaim(ctx, &goredis.XAutoClaimArgs{
			Stream:   streamName,
			Group:    groupName,
			Consumer: consumerName,
			MinIdle:  5 * time.Minute,
			Start:    nextID,
			Count:    10,
		}).Result()
		if err != nil || len(msgs) == 0 {
			break
		}
		log.Printf("[startup] reclaimed %d orphaned messages", len(msgs))
		for _, msg := range msgs {
			currentMsgID = msg.ID
			processMessage(ctx, msg)
			currentMsgID = ""
		}
		nextID = nextStartID
		if nextID == "0-0" {
			break
		}
	}
}
