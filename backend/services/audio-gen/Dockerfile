FROM golang:1.25-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o audio-gen .

FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=builder /app/audio-gen .
COPY models.json ./models.json

ENV MODELS_JSON_PATH=models.json

ENTRYPOINT ["./audio-gen"]
