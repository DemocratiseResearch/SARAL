package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	gcs "cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

// Client wraps the GCS client and bucket name together so callers
// don't need to thread the bucket name through every call.
type Client struct {
	gcs    *gcs.Client
	bucket string
}

// New creates a GCS storage client. When STORAGE_EMULATOR_HOST is set it
// points at the local emulator instead of real GCS.
func New(ctx context.Context, emulatorHost, bucketName string) (*Client, error) {
	var raw *gcs.Client
	var err error

	if emulatorHost != "" {
		if !strings.HasPrefix(emulatorHost, "http") {
			emulatorHost = "http://" + emulatorHost
		}
		endpoint := emulatorHost + "/storage/v1/"
		raw, err = gcs.NewClient(ctx,
			option.WithEndpoint(endpoint),
			option.WithoutAuthentication(),
		)
	} else {
		raw, err = gcs.NewClient(ctx)
	}
	if err != nil {
		return nil, fmt.Errorf("gcs client init: %w", err)
	}
	return &Client{gcs: raw, bucket: bucketName}, nil
}

// Download fetches the object at gcsPath and returns its contents.
// Accepts both "gs://bucket/key" and bare "key" forms.
func (c *Client) Download(ctx context.Context, gcsPath string) ([]byte, error) {
	key := extractKey(gcsPath)
	rc, err := c.gcs.Bucket(c.bucket).Object(key).NewReader(ctx)
	if err != nil {
		return nil, fmt.Errorf("open gcs object %q: %w", key, err)
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// Upload writes data to objectKey in the configured bucket and returns the
// canonical "gs://bucket/key" path.
func (c *Client) Upload(ctx context.Context, data []byte, objectKey, contentType string) (string, error) {
	wc := c.gcs.Bucket(c.bucket).Object(objectKey).NewWriter(ctx)
	wc.ContentType = contentType
	if _, err := io.Copy(wc, bytes.NewReader(data)); err != nil {
		_ = wc.Close()
		return "", fmt.Errorf("write gcs object %q: %w", objectKey, err)
	}
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("close gcs object %q: %w", objectKey, err)
	}
	return "gs://" + c.bucket + "/" + objectKey, nil
}

// extractKey strips the "gs://bucket/" prefix so callers can pass either form.
func extractKey(gcsPath string) string {
	if strings.HasPrefix(gcsPath, "gs://") {
		parts := strings.SplitN(gcsPath[5:], "/", 2)
		if len(parts) == 2 {
			return parts[1]
		}
	}
	return gcsPath
}
