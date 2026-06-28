package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/models"
)

// Manager holds SSE connections for this gateway instance.
// Cross-instance delivery is handled by Redis Pub/Sub in PublishEvent.

type Manager struct {
	mu      sync.RWMutex
	clients map[uuid.UUID]chan models.SSEEvent
	rdb     *goredis.Client
	pool    *pgxpool.Pool
}

func NewManager(rdb *goredis.Client, pool *pgxpool.Pool) *Manager {
	return &Manager{
		clients: make(map[uuid.UUID]chan models.SSEEvent),
		rdb:     rdb,
		pool:    pool,
	}
}

func pubSubChannel(runID uuid.UUID) string {
	return fmt.Sprintf("saral:sse:%s", runID)
}

// PublishEvent is called by the webhook handler when a stage completes or fails.
// It publishes to Redis so ALL gateway instances receive the event.
func (m *Manager) PublishEvent(ctx context.Context, runID uuid.UUID, event models.SSEEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("SSE: failed to marshal event: %v", err)
		return
	}
	if err := m.rdb.Publish(ctx, pubSubChannel(runID), string(data)).Err(); err != nil {
		log.Printf("SSE: Redis publish failed for run_id=%s: %v — pushing locally", runID, err)
		// Fallback: if Redis Publish fails, push directly to local map.
		// This handles brief Redis blips without dropping events.
		m.pushLocal(runID, event)
	}
}

func (m *Manager) pushLocal(runID uuid.UUID, event models.SSEEvent) {
	m.mu.RLock()
	ch, ok := m.clients[runID]
	m.mu.RUnlock()
	if !ok {
		return
	}
	select {
	case ch <- event:
	default:
		// Buffer full — client recovers via /status polling
	}
}


func (m *Manager) StreamHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		// Mandatory SSE headers
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no") // prevents nginx buffering SSE events
		c.Header("Access-Control-Allow-Origin", "*")

		// Buffered channel — pipeline has at most 6 stages so 20 is plenty
		ch := make(chan models.SSEEvent, 20)
		m.mu.Lock()
		m.clients[runID] = ch
		m.mu.Unlock()

		defer func() {
			m.mu.Lock()
			delete(m.clients, runID)
			m.mu.Unlock()
			close(ch)
		}()

		// Context cancels when browser disconnects
		ctx, cancel := context.WithCancel(c.Request.Context())
		defer cancel()

		// Subscribe to Redis Pub/Sub BEFORE the replay DB query so that any
		// event published between the query and the live loop is not lost.
		pubsub := m.rdb.Subscribe(ctx, pubSubChannel(runID))
		defer pubsub.Close()

		// Bridge goroutine: Redis Pub/Sub → local channel
		go func() {
			redisCh := pubsub.Channel()
			for {
				select {
				case <-ctx.Done():
					return
				case msg, ok := <-redisCh:
					if !ok {
						return
					}
					var event models.SSEEvent
					if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
						log.Printf("SSE: bad Redis payload: %v", err)
						continue
					}
					select {
					case ch <- event:
					case <-ctx.Done():
						return
					}
				}
			}
		}()

		w := c.Writer
		flusher, canFlush := w.(http.Flusher)

		// writeEvent serialises and flushes one SSE event to the client.
		// Returns false when the event is terminal (stream should close).
		writeEvent := func(event models.SSEEvent) bool {
			data, _ := json.Marshal(event)
			if event.ID != "" {
				fmt.Fprintf(w, "id: %s\ndata: %s\n\n", event.ID, data)
			} else {
				fmt.Fprintf(w, "data: %s\n\n", data)
			}
			if canFlush {
				flusher.Flush()
			}
			return event.Status != "failed" && !(event.Step == "pipeline" && event.Status == "completed")
		}

		lastEventID := c.GetHeader("Last-Event-ID")
		if lastEventID != "" {
			steps, runStatus, err := db.GetStepsForReplay(ctx, m.pool, runID, lastEventID)
			if err != nil {
				log.Printf("SSE: replay query failed for run_id=%s: %v", runID, err)
			} else {
				for i, step := range steps {
					isLastSeen := i == 0 && step.ID.String() == lastEventID

					if isLastSeen {

						if step.Status == "completed" || step.Status == "failed" {
							msg := step.StepName + " " + step.Status
							if step.Status == "failed" {
								msg = step.ErrorMsg
							}
							if !writeEvent(models.SSEEvent{ID: step.ID.String(), Step: step.StepName, Status: step.Status, Message: msg}) {
								return
							}
						}
					} else {
						// New step: emit processing + terminal (if resolved).
						if !writeEvent(models.SSEEvent{ID: step.ID.String(), Step: step.StepName, Status: "processing", Message: "Starting " + step.StepName}) {
							return
						}
						if step.Status == "completed" || step.Status == "failed" {
							msg := step.StepName + " " + step.Status
							if step.Status == "failed" {
								msg = step.ErrorMsg
							}
							if !writeEvent(models.SSEEvent{ID: step.ID.String(), Step: step.StepName, Status: step.Status, Message: msg}) {
								return
							}
						}
					}
				}


				if runStatus == "completed" {
					writeEvent(models.SSEEvent{Step: "pipeline", Status: "completed", Message: "Your video is ready"})
					return
				}
				if runStatus == "failed" {
					writeEvent(models.SSEEvent{Step: "pipeline", Status: "failed", Message: "Pipeline failed"})
					return
				}
			}
		}

		// ── Live event loop ───────────────────────────────────────────────────
		clientGone := c.Request.Context().Done()
		for {
			select {
			case <-clientGone:
				return

			case event, ok := <-ch:
				if !ok {
					return
				}
				if !writeEvent(event) {
					return
				}
			}
		}
	}
}



func briefPubSubChannel(briefID uuid.UUID) string {
	return fmt.Sprintf("saral:sse:brief:%s", briefID)
}


func (m *Manager) PublishBriefEvent(ctx context.Context, briefID uuid.UUID, event models.SSEEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("SSE: failed to marshal brief event: %v", err)
		return
	}
	if err := m.rdb.Publish(ctx, briefPubSubChannel(briefID), string(data)).Err(); err != nil {
		log.Printf("SSE: Redis publish failed for brief_id=%s: %v — pushing locally", briefID, err)
		m.pushLocal(briefID, event)
	}
}


func (m *Manager) BriefStreamHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		paperID, err := uuid.Parse(c.Param("paper_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_paper_id", "invalid paper_id")
			return
		}

		brief, err := db.GetBusinessBriefByPaper(ctx, m.pool, paperID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "brief_not_found", "no business brief for this paper")
			return
		}

		// Mandatory SSE headers
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")
		c.Header("Access-Control-Allow-Origin", "*")

		w := c.Writer
		flusher, canFlush := w.(http.Flusher)

		writeEvent := func(event models.SSEEvent) {
			data, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", data)
			if canFlush {
				flusher.Flush()
			}
		}

		// If the brief already reached a terminal state, send the result and close.
		if brief.Status == "completed" {
			writeEvent(models.SSEEvent{Step: "business_brief_pdf_render", Status: "completed", Message: "Business brief is ready"})
			return
		}
		if brief.Status == "failed" {
			msg := brief.ErrorMessage
			if msg == "" {
				msg = "Business brief generation failed"
			}
			failedStep := "business_brief_script"
			if brief.JSONGCSPath != "" {
				failedStep = "business_brief_pdf_render"
			}
			writeEvent(models.SSEEvent{Step: failedStep, Status: "failed", Message: msg})
			return
		}

		// Brief is still processing — stream live events.
		ch := make(chan models.SSEEvent, 4)
		m.mu.Lock()
		m.clients[brief.ID] = ch
		m.mu.Unlock()
		defer func() {
			m.mu.Lock()
			delete(m.clients, brief.ID)
			m.mu.Unlock()
			close(ch)
		}()

		liveCtx, cancel := context.WithCancel(ctx)
		defer cancel()

		pubsub := m.rdb.Subscribe(liveCtx, briefPubSubChannel(brief.ID))
		defer pubsub.Close()

		go func() {
			redisCh := pubsub.Channel()
			for {
				select {
				case <-liveCtx.Done():
					return
				case msg, ok := <-redisCh:
					if !ok {
						return
					}
					var event models.SSEEvent
					if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
						log.Printf("SSE: bad brief Redis payload: %v", err)
						continue
					}
					select {
					case ch <- event:
					case <-liveCtx.Done():
						return
					}
				}
			}
		}()

		clientGone := ctx.Done()
		for {
			select {
			case <-clientGone:
				return
			case event, ok := <-ch:
				if !ok {
					return
				}
				writeEvent(event)
				// Terminal event — close the stream.
				if event.Status == "completed" || event.Status == "failed" {
					return
				}
			}
		}
	}
}
