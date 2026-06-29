FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o script-gen .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/script-gen .
COPY prompts/ prompts/
ENV PROMPTS_PATH=prompts/prompts.json
CMD ["./script-gen"]
