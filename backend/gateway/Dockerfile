# ── Build stage ───────────────────────────────────────────────────────────────
# go 1.25 matches the go directive in go.mod
FROM golang:1.25-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/gateway .

# Cloud Run injects $PORT automatically (default 8080).
# FIREBASE_PROJECT_ID + Application Default Credentials are used on GCP —
# no service-account JSON file is baked into this image.
EXPOSE 8080
ENTRYPOINT ["./gateway"]
