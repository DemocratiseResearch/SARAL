package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	redis "github.com/redis/go-redis/v9"
)

const (
	WorkerTimestampHeader = "X-Saral-Worker-Timestamp"
	WorkerNonceHeader     = "X-Saral-Worker-Nonce"
	WorkerSignatureHeader = "X-Saral-Worker-Signature"
	workerMaxBodyBytes    = 1 << 20 // 1 MiB
	workerMaxAge          = 5 * time.Minute
	workerFutureSkew      = 30 * time.Second
	workerReplayTTL       = 10 * time.Minute
)

var workerServicePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// ReplayGuard claims a worker nonce once. Implementations must be atomic across
// gateway instances and fail closed when the replay store is unavailable.
type ReplayGuard interface {
	Claim(ctx context.Context, key string, ttl time.Duration) (bool, error)
}

// RedisReplayGuard uses SET NX so a nonce can only be accepted once across all
// gateway replicas.
type RedisReplayGuard struct {
	client *redis.Client
}

func NewRedisReplayGuard(client *redis.Client) *RedisReplayGuard {
	return &RedisReplayGuard{client: client}
}

func (g *RedisReplayGuard) Claim(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	if g == nil || g.client == nil {
		return false, redis.Nil
	}
	return g.client.SetNX(ctx, key, "1", ttl).Result()
}

// SignatureMiddleware authenticates service-to-service worker callbacks.
// Signature input is:
//
//	METHOD + "\n" + RequestURI + "\n" + timestamp + "\n" + nonce + "\n" + raw body
//
// The secret must be a randomly generated value of at least 32 bytes.
func SignatureMiddleware(secret []byte, replay ReplayGuard) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(secret) < 32 || replay == nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "worker webhook authentication unavailable"})
			return
		}

		service := c.Param("service")
		if !workerServicePattern.MatchString(service) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid worker identity"})
			return
		}

		timestamp := c.GetHeader(WorkerTimestampHeader)
		nonce := c.GetHeader(WorkerNonceHeader)
		signature := c.GetHeader(WorkerSignatureHeader)
		if timestamp == "" || nonce == "" || signature == "" || len(nonce) > 128 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing worker signature"})
			return
		}
		nonceBytes, err := hex.DecodeString(nonce)
		if err != nil || len(nonceBytes) < 16 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid worker nonce"})
			return
		}
		issuedAt, err := strconv.ParseInt(timestamp, 10, 64)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid worker timestamp"})
			return
		}
		age := time.Since(time.Unix(issuedAt, 0))
		if age > workerMaxAge || age < -workerFutureSkew {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "expired worker signature"})
			return
		}

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, workerMaxBodyBytes)
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "worker payload too large"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))

		canonical := c.Request.Method + "\n" + c.Request.URL.RequestURI() + "\n" + timestamp + "\n" + nonce + "\n"
		mac := hmac.New(sha256.New, secret)
		_, _ = mac.Write([]byte(canonical))
		_, _ = mac.Write(body)
		supplied, err := hex.DecodeString(signature)
		if err != nil || !hmac.Equal(mac.Sum(nil), supplied) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid worker signature"})
			return
		}

		replayKey := "saral:webhook:nonce:" + service + ":" + strings.ToLower(nonce)
		claimed, err := replay.Claim(c.Request.Context(), replayKey, workerReplayTTL)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "worker replay protection unavailable"})
			return
		}
		if !claimed {
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "worker request replayed"})
			return
		}

		c.Next()
	}
}
