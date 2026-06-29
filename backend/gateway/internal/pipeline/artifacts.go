package pipeline

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/saral/gateway/internal/apiresp"
	"github.com/saral/gateway/internal/db"
	"github.com/saral/gateway/internal/storage"
)


func ExtractedHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetStepOutput(ctx, pool, runID, "pdf_extract")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "extraction_not_ready", "extraction not ready or not found")
			return
		}

		data, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_fetch_failed", "failed to fetch extracted data")
			return
		}

		var extracted any
		if err := json.Unmarshal(data, &extracted); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_decode_failed", "failed to decode extracted data")
			return
		}

		apiresp.OK(c, extracted)
	}
}


func SlidesHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		slidesPDFPath, err := db.GetStepOutput(ctx, pool, runID, "beamer_compile")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "slides_not_ready", "slides not compiled yet")
			return
		}

		slidesURL, err := storage.GeneratePresignedURL(ctx, slidesPDFPath, time.Hour)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "slides_url_failed", "could not generate slides URL")
			return
		}

		apiresp.OK(c, gin.H{
			"slides_pdf_url": slidesURL,
			"expires_in":     3600,
		})
	}
}

func AudioManifestHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		audioManifestPath, err := db.GetStepOutput(ctx, pool, runID, "audio_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "audio_not_ready", "audio not generated yet")
			return
		}

		data, err := storage.DownloadJSON(ctx, audioManifestPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_fetch_failed", "failed to fetch audio manifest")
			return
		}

		var manifest interface{}
		if err := json.Unmarshal(data, &manifest); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_decode_failed", "failed to decode audio manifest")
			return
		}

		apiresp.OK(c, manifest)
	}
}


func AudioSlideHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		slideIndex := -1
		fmt.Sscanf(c.Param("slide_index"), "%d", &slideIndex)
		if slideIndex < 0 {
			apiresp.Error(c, http.StatusBadRequest, "invalid_slide_index", "slide_index must be a non-negative integer")
			return
		}

		ctx := c.Request.Context()

		audioManifestPath, err := db.GetStepOutput(ctx, pool, runID, "audio_gen")
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "audio_not_ready", "audio not generated yet")
			return
		}

		data, err := storage.DownloadJSON(ctx, audioManifestPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_fetch_failed", "failed to fetch audio manifest")
			return
		}

		var manifest struct {
			Slides []struct {
				FrameIndex int      `json:"frame_index"`
				AudioPaths []string `json:"audio_paths"`
			} `json:"slides"`
		}
		if err := json.Unmarshal(data, &manifest); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "audio_decode_failed", "failed to decode audio manifest")
			return
		}

		for _, slide := range manifest.Slides {
			if slide.FrameIndex == slideIndex {
				urls := make([]string, 0, len(slide.AudioPaths))
				for _, ap := range slide.AudioPaths {
					url, err := storage.GeneratePresignedURL(ctx, ap, time.Hour)
					if err != nil {
						apiresp.Error(c, http.StatusInternalServerError, "presign_failed", "could not generate audio URL")
						return
					}
					urls = append(urls, url)
				}
				apiresp.OK(c, gin.H{
					"slide_index": slideIndex,
					"audio_urls":  urls,
					"expires_in":  3600,
				})
				return
			}
		}

		apiresp.Error(c, http.StatusNotFound, "slide_not_found", "slide index not found in audio manifest")
	}
}


func ImagesHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}

		ctx := c.Request.Context()

		gcsPath, err := db.GetExtractedJSONPathForRun(ctx, pool, runID)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "extraction_not_ready", "extraction not ready")
			return
		}

		data, err := storage.DownloadJSON(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_fetch_failed", "failed to fetch extracted data")
			return
		}

		var extracted struct {
			ImagePaths []string `json:"image_paths"`
		}
		if err := json.Unmarshal(data, &extracted); err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "extracted_decode_failed", "failed to decode extracted data")
			return
		}

		type imageEntry struct {
			Index   int    `json:"index"`
			URL     string `json:"url"`
			GCSPath string `json:"gcs_path"`
		}
		results := make([]imageEntry, 0, len(extracted.ImagePaths))
		for i, imgPath := range extracted.ImagePaths {
			url, err := storage.GeneratePresignedURL(ctx, imgPath, time.Hour)
			if err != nil {
				apiresp.Error(c, http.StatusInternalServerError, "presign_failed", "could not generate image URL")
				return
			}
			results = append(results, imageEntry{Index: i, URL: url, GCSPath: imgPath})
		}

		apiresp.OK(c, gin.H{
			"images":     results,
			"expires_in": 3600,
		})
	}
}

// DownloadHandler streams the final video through the gateway with
// Content-Disposition: attachment so the browser saves it to disk.
//
// Streams from the same origin to avoid cross-origin redirect stripping
// the <a download> attribute. Range requests are supported for resumable downloads.
func DownloadHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		artifactType := "ffmpeg_stitch"
		if c.Query("subs") == "on" {
			if path, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch_subs"); err == nil && path != "" {
				artifactType = "ffmpeg_stitch_subs"
				_ = path
			}
		}

		gcsPath, err := db.GetArtifact(ctx, pool, runID, artifactType)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_ready", "video not ready")
			return
		}

		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "download_failed", "could not access video")
			return
		}

		c.Header("Content-Disposition", `attachment; filename="video.mp4"`)
		c.Header("Content-Type", "video/mp4")
		c.Header("Accept-Ranges", "bytes")

		serveVideoRange(c, ctx, gcsPath, size)
	}
}

// VideoStreamHandler serves the final video with HTTP Range support for in-browser playback.
func VideoStreamHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		runID, err := uuid.Parse(c.Param("run_id"))
		if err != nil {
			apiresp.Error(c, http.StatusBadRequest, "invalid_run_id", "invalid run_id")
			return
		}
		ctx := c.Request.Context()

		artifactType := "ffmpeg_stitch"
		if c.Query("subs") == "on" {
			if path, err := db.GetArtifact(ctx, pool, runID, "ffmpeg_stitch_subs"); err == nil && path != "" {
				artifactType = "ffmpeg_stitch_subs"
				_ = path
			}
		}

		gcsPath, err := db.GetArtifact(ctx, pool, runID, artifactType)
		if err != nil {
			apiresp.Error(c, http.StatusNotFound, "video_not_ready", "video not ready")
			return
		}

		size, err := storage.GetObjectSize(ctx, gcsPath)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not access video")
			return
		}

		c.Header("Accept-Ranges", "bytes")
		c.Header("Content-Type", "video/mp4")

		serveVideoRange(c, ctx, gcsPath, size)
	}
}

// serveVideoRange handles both full and range (206) responses for video files.
func serveVideoRange(c *gin.Context, ctx interface{ Done() <-chan struct{} }, gcsPath string, size int64) {
	rangeHeader := c.GetHeader("Range")
	if rangeHeader == "" {
		rc, err := storage.NewRangeReader(c.Request.Context(), gcsPath, 0, -1)
		if err != nil {
			apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not open video")
			return
		}
		defer rc.Close()
		c.Header("Content-Length", fmt.Sprintf("%d", size))
		c.Status(http.StatusOK)
		io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
		return
	}

	rangeVal := strings.TrimPrefix(rangeHeader, "bytes=")
	parts := strings.SplitN(rangeVal, "-", 2)
	if len(parts) != 2 {
		c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	var start, end int64
	if parts[0] == "" {
		n, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || n <= 0 {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		start = size - n
		end = size - 1
	} else {
		var err error
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		if parts[1] == "" {
			end = size - 1
		} else {
			end, err = strconv.ParseInt(parts[1], 10, 64)
			if err != nil {
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			if end >= size {
				end = size - 1
			}
		}
	}

	if start > end || start >= size {
		c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	length := end - start + 1
	rc, err := storage.NewRangeReader(c.Request.Context(), gcsPath, start, length)
	if err != nil {
		apiresp.Error(c, http.StatusInternalServerError, "stream_failed", "could not read video range")
		return
	}
	defer rc.Close()

	c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
	c.Header("Content-Length", fmt.Sprintf("%d", length))
	c.Status(http.StatusPartialContent)
	io.CopyBuffer(c.Writer, rc, make([]byte, 256*1024)) //nolint:errcheck
}
