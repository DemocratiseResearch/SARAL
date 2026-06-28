package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	gcs "cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

var (
	storageClient *gcs.Client
	bucketName    string
)

func Init() {
	bucketName = os.Getenv("STORAGE_BUCKET")
	if bucketName == "" {
		bucketName = "saral-artifacts-local"
	}

	ctx := context.Background()
	var err error

	if emulatorHost := os.Getenv("STORAGE_EMULATOR_HOST"); emulatorHost != "" {
		if !strings.HasPrefix(emulatorHost, "http") {
			emulatorHost = "http://" + emulatorHost
		}

		endpoint := emulatorHost + "/storage/v1/"
		storageClient, err = gcs.NewClient(ctx,
			option.WithEndpoint(endpoint),
			option.WithoutAuthentication(),
		)
	} else {

		storageClient, err = gcs.NewClient(ctx)
	}

	if err != nil {
		panic(fmt.Sprintf("storage.Init: failed to create GCS client: %v", err))
	}
}


func Upload(ctx context.Context, body io.Reader, objectKey, contentType string) (string, error) {
	wc := storageClient.Bucket(bucketName).Object(objectKey).NewWriter(ctx)
	wc.ContentType = contentType

	if _, err := io.Copy(wc, body); err != nil {
		_ = wc.Close() // cancels the in-flight upload on GCS
		return "", fmt.Errorf("storage.Upload: io.Copy: %w", err)
	}
	// Close() finalises the upload. It must be called even on success.
	// If this returns an error, the object is not visible in GCS yet.
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("storage.Upload: finalise: %w", err)
	}
	return "gs://" + bucketName + "/" + objectKey, nil
}


func GeneratePresignedURL(ctx context.Context, storagePath string, ttl time.Duration) (string, error) {
	key := extractKey(storagePath)

	if os.Getenv("ENV") == "local" {
		emulatorHost := os.Getenv("STORAGE_EMULATOR_HOST")
		if emulatorHost == "" {
			emulatorHost = "localhost:4443"
		}
		if !strings.HasPrefix(emulatorHost, "http") {
			emulatorHost = "http://" + emulatorHost
		}
		encodedKey := url.PathEscape(key)
		return fmt.Sprintf("%s/download/storage/v1/b/%s/o/%s?alt=media",
			emulatorHost, bucketName, encodedKey), nil
	}


	opts := &gcs.SignedURLOptions{
		Method:  "GET",
		Expires: time.Now().Add(ttl),
		Scheme:  gcs.SigningSchemeV4,
	}
	return storageClient.Bucket(bucketName).SignedURL(key, opts)
}


func UploadBytes(ctx context.Context, data []byte, objectKey, contentType string) (string, error) {
	wc := storageClient.Bucket(bucketName).Object(objectKey).NewWriter(ctx)
	wc.ContentType = contentType
	if _, err := wc.Write(data); err != nil {
		_ = wc.Close()
		return "", fmt.Errorf("storage.UploadBytes: write: %w", err)
	}
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("storage.UploadBytes: finalise: %w", err)
	}
	return "gs://" + bucketName + "/" + objectKey, nil
}


func ExtractKey(storagePath string) string {
	return extractKey(storagePath)
}

// BucketName returns the configured GCS bucket name. Init must have been called.
func BucketName() string {
	return bucketName
}

// DownloadJSON downloads a JSON object from GCS and returns the raw bytes.
func DownloadJSON(ctx context.Context, storagePath string) ([]byte, error) {
	key := extractKey(storagePath)
	rc, err := storageClient.Bucket(bucketName).Object(key).NewReader(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage.DownloadJSON: %w", err)
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// GetObjectSize returns the total size of a GCS object in bytes.
func GetObjectSize(ctx context.Context, storagePath string) (int64, error) {
	key := extractKey(storagePath)
	attrs, err := storageClient.Bucket(bucketName).Object(key).Attrs(ctx)
	if err != nil {
		return 0, fmt.Errorf("storage.GetObjectSize: %w", err)
	}
	return attrs.Size, nil
}


func GeneratePresignedDownloadURL(ctx context.Context, storagePath string, filename string, ttl time.Duration) (string, error) {
	key := extractKey(storagePath)
	disposition := fmt.Sprintf("attachment; filename=%q", filename)

	if os.Getenv("ENV") == "local" {
		emulatorHost := os.Getenv("STORAGE_EMULATOR_HOST")
		if emulatorHost == "" {
			emulatorHost = "localhost:4443"
		}
		if !strings.HasPrefix(emulatorHost, "http") {
			emulatorHost = "http://" + emulatorHost
		}
		encodedKey := url.PathEscape(key)
		return fmt.Sprintf("%s/download/storage/v1/b/%s/o/%s?alt=media&response-content-disposition=%s",
			emulatorHost, bucketName, encodedKey, url.QueryEscape(disposition)), nil
	}


	opts := &gcs.SignedURLOptions{
		Method:  "GET",
		Expires: time.Now().Add(ttl),
		Scheme:  gcs.SigningSchemeV4,
		QueryParameters: url.Values{
			"response-content-disposition": {disposition},
		},
	}
	return storageClient.Bucket(bucketName).SignedURL(key, opts)
}


func NewRangeReader(ctx context.Context, storagePath string, offset, length int64) (io.ReadCloser, error) {
	key := extractKey(storagePath)
	rc, err := storageClient.Bucket(bucketName).Object(key).NewRangeReader(ctx, offset, length)
	if err != nil {
		return nil, fmt.Errorf("storage.NewRangeReader: %w", err)
	}
	return rc, nil
}


func NewReader(ctx context.Context, storagePath string) (io.ReadCloser, int64, error) {
	key := extractKey(storagePath)
	obj := storageClient.Bucket(bucketName).Object(key)

	attrs, err := obj.Attrs(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("storage.NewReader: attrs: %w", err)
	}

	rc, err := obj.NewReader(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("storage.NewReader: open: %w", err)
	}
	return rc, attrs.Size, nil
}


func extractKey(storagePath string) string {
	if strings.HasPrefix(storagePath, "gs://") {
		parts := strings.SplitN(storagePath[len("gs://"):], "/", 2)
		if len(parts) == 2 {
			return parts[1]
		}
	}
	return storagePath // already a bare key
}


func Exists(ctx context.Context, storagePath string) bool {
	if storagePath == "" {
		return false
	}
	key := extractKey(storagePath)
	_, err := storageClient.Bucket(bucketName).Object(key).Attrs(ctx)
	return err == nil
}

// SeedAvatarsIfMissing uploads each avatar PNG from localDir into GCS at
// prefix+filename if the object does not already exist there.

func SeedAvatarsIfMissing(ctx context.Context, localDir string, filenames []string, prefix string) {
	for _, name := range filenames {
		key := prefix + name

		// Skip upload if the object already exists in GCS.
		if _, err := storageClient.Bucket(bucketName).Object(key).Attrs(ctx); err == nil {
			continue
		}

		localPath := localDir + "/" + name
		data, err := os.ReadFile(localPath)
		if err != nil {
			log.Printf("SeedAvatarsIfMissing: WARNING — cannot read %s: %v (skipping)", localPath, err)
			continue
		}

		if _, uploadErr := UploadBytes(ctx, data, key, "image/png"); uploadErr != nil {
			log.Printf("SeedAvatarsIfMissing: WARNING — failed to upload %s: %v", name, uploadErr)
		} else {
			log.Printf("SeedAvatarsIfMissing: uploaded %s -> gs://%s/%s", localPath, bucketName, key)
		}
	}
}
