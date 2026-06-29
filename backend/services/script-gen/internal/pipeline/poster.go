package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/webhook"
)

// PosterContent is the structured output uploaded to GCS after the poster pipeline.
type PosterContent struct {
	Title          string   `json:"title"`
	Authors        string   `json:"authors"`
	Abstract       string   `json:"abstract"`
	Introduction   []string `json:"introduction"`
	Methodology    []string `json:"methodology"`
	Results        []string `json:"results"`
	Conclusion     []string `json:"conclusion"`
	References     []string `json:"references"`
	SelectedImages []string `json:"selected_images,omitempty"`
}

// RunPoster generates a structured poster content JSON from an extracted paper.
// Metadata extraction and poster generation run concurrently for lower latency.
func RunPoster(ctx context.Context, gc gemini.Provider, deps Deps,
	runID, stepID, extractedPath, userID, paperID string,
) error {
	data, err := deps.Store.Download(ctx, extractedPath)
	if err != nil {
		return fmt.Errorf("download extracted: %w", err)
	}
	var extracted ExtractedDocument
	if err := json.Unmarshal(data, &extracted); err != nil {
		return fmt.Errorf("parse extracted.json: %w", err)
	}

	// ── Metadata + poster content in parallel ─────────────────────────────────
	type posterResult struct {
		content PosterContent
		err     error
	}
	type metaResult struct {
		meta gemini.Metadata
		err  error
	}

	posterCh := make(chan posterResult, 1)
	metaCh := make(chan metaResult, 1)

	go func() {
		// Poster prompt includes a placeholder title/authors which Gemini fills;
		// we override them below with the metadata extraction result.
		prompt := posterPrompt("", "", extracted.Text, deps.Prompts)
		raw, err := gemini.Generate(ctx, gc, gemini.ModelFlash, prompt)
		if err != nil {
			posterCh <- posterResult{err: err}
			return
		}
		raw = gemini.StripCodeFences(raw)
		raw = gemini.FixJSONBackslashes(raw)
		var content PosterContent
		if parseErr := json.Unmarshal([]byte(raw), &content); parseErr != nil {
			posterCh <- posterResult{err: fmt.Errorf("parse poster JSON: %w", parseErr)}
			return
		}
		posterCh <- posterResult{content: content}
	}()

	go func() {
		meta, err := gemini.ExtractMetadata(ctx, gc, extracted.Text)
		metaCh <- metaResult{meta: meta, err: err}
	}()

	posterRes := <-posterCh
	if posterRes.err != nil {
		return fmt.Errorf("gemini poster: %w", posterRes.err)
	}
	content := posterRes.content

	metaRes := <-metaCh
	if metaRes.err != nil {
		log.Printf("[poster][%s] metadata extraction failed, relying on Gemini output: %v", runID, metaRes.err)
	} else {
		// Hard-override title/authors so they are never paraphrased by the model
		if metaRes.meta.Title != "" {
			content.Title = metaRes.meta.Title
		}
		if metaRes.meta.Authors != "" {
			content.Authors = metaRes.meta.Authors
		}
	}

	// Image selection runs after the poster content is ready (needs the title)
	content.SelectedImages = filterAndRankImages(ctx, gc, extracted.ImagePaths, content.Title)

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/script_gen/poster_content.json", userID, paperID, runUUID)
	contentBytes, _ := json.Marshal(content)
	gcsPath, err := deps.Store.Upload(ctx, contentBytes, objectKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload poster content: %w", err)
	}

	webhook.Send(deps.GatewayURL, runID, stepID, "script_gen", "completed", gcsPath, "", content.Title, content.Authors, "")
	log.Printf("[poster][%s] completed: output=%s title=%q images=%d", runID, gcsPath, content.Title, len(content.SelectedImages))
	return nil
}

// ── Image filter (3-stage: geometric → score → Gemini Vision) ────────────────

// filterAndRankImages returns up to 2 GCS paths of the best content-relevant
// figures extracted from the paper. Uses three stages:
//  1. Geometric filter — drop zero-size, extreme aspect ratio, tiny images
//  2. Score ranking   — prefer large images from non-cover pages
//  3. Gemini Vision   — classify as "figure" or "logo", keep only figures
func filterAndRankImages(ctx context.Context, gc gemini.Provider, gcsImagePaths []string, paperTitle string) []string {
	type scoredImg struct {
		gcsPath string
		score   float64
		data    []byte
	}

	log.Printf("[image-filter] stage 1: geometric filter — %d input images", len(gcsImagePaths))

	// Stage 1 — Geometric filter
	var candidates []scoredImg
	for _, gcsPath := range gcsImagePaths {
		name := path.Base(gcsPath)

		// Download is needed for both dimension check and Vision classification
		data, err := downloadImageBytes(ctx, gc, gcsPath)
		if err != nil {
			log.Printf("[image-filter] SKIP  %s — download error: %v", name, err)
			continue
		}

		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			log.Printf("[image-filter] SKIP  %s — decode error: %v", name, err)
			continue
		}
		if cfg.Width == 0 || cfg.Height == 0 {
			continue
		}
		ar := float64(cfg.Width) / float64(cfg.Height)
		if ar > 5.0 || ar < 0.2 {
			log.Printf("[image-filter] DROP  %s — extreme aspect ratio %.2f", name, ar)
			continue
		}
		if cfg.Width*cfg.Height < 10000 {
			log.Printf("[image-filter] DROP  %s — too small %dx%d", name, cfg.Width, cfg.Height)
			continue
		}

		pageWeight := inferPageWeight(gcsPath)
		score := float64(cfg.Width*cfg.Height) * pageWeight
		log.Printf("[image-filter] PASS  %s — %dx%d ar=%.2f score=%.0f", name, cfg.Width, cfg.Height, ar, score)
		candidates = append(candidates, scoredImg{gcsPath: gcsPath, score: score, data: data})
	}

	log.Printf("[image-filter] stage 2: score ranking — %d candidates", len(candidates))

	// Stage 2 — Sort by score, keep top 5
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].score > candidates[j].score
	})
	if len(candidates) > 5 {
		candidates = candidates[:5]
	}

	log.Printf("[image-filter] stage 3: Gemini Vision classification — %d images", len(candidates))

	// Stage 3 — Gemini Vision: classify each candidate
	var kept []string
	for _, img := range candidates {
		name := path.Base(img.gcsPath)
		isFig, err := gemini.GenerateVisionClassify(ctx, gc, img.data, paperTitle)
		if err != nil {
			log.Printf("[image-filter] WARN  %s — classification error (keeping): %v", name, err)
			kept = append(kept, img.gcsPath)
			continue
		}
		if isFig {
			log.Printf("[image-filter] KEEP  %s", name)
			kept = append(kept, img.gcsPath)
		} else {
			log.Printf("[image-filter] DROP  %s — classified as logo/decoration", name)
		}
	}

	if len(kept) > 2 {
		kept = kept[:2]
	}
	log.Printf("[image-filter] final: %d image(s) selected", len(kept))
	return kept
}

// downloadImageBytes is a thin wrapper — the image filter needs raw bytes before
// the storage.Client is in scope, so it uses the GCS client directly via the
// gemini package's context (they share the same GCP project credentials).
// In practice, deps.Store.Download would work just as well; this avoids passing
// Deps into the image filter helper.
func downloadImageBytes(ctx context.Context, _ gemini.Provider, gcsPath string) ([]byte, error) {
	// The image filter is always called with the same storage client that deps.Store
	// wraps. Since we can't reach it from here without Deps, we store a reference
	// to the active storage client in a package-level var set by RunPoster's caller.
	// See posterStore below.
	if posterStore == nil {
		return nil, fmt.Errorf("posterStore not initialised")
	}
	return posterStore.Download(ctx, gcsPath)
}

// posterStore is set by the worker before RunPoster is called.
// It avoids threading the full Deps struct into the image-filter helper.
var posterStore GCSClient

// SetPosterStore must be called once at startup with the application's GCS client.
func SetPosterStore(s GCSClient) { posterStore = s }

// inferPageWeight returns a reduced score for images likely on page 0 (cover),
// which tends to contain logos and decorative elements rather than figures.
func inferPageWeight(gcsPath string) float64 {
	filename := path.Base(gcsPath)
	pageZeroRE := regexp.MustCompile(`(?i)(?:^|[/_-])p(?:age)?[_-]?0+[_-]`)
	if pageZeroRE.MatchString(filename) {
		return 0.4
	}
	return 1.0
}

// ── Prompt builder ────────────────────────────────────────────────────────────

func posterPrompt(title, authors, paperText string, prompts config.PromptConfig) string {
	sys := prompts.Poster.System
	rules := strings.Join(prompts.Poster.Rules, "\n- ")

	header := ""
	if title != "" {
		header += fmt.Sprintf("Title: %s\n", title)
	}
	if authors != "" {
		header += fmt.Sprintf("Authors: %s\n", authors)
	}
	if header != "" {
		header += "\n"
	}

	return fmt.Sprintf("%s\n\nRules:\n- %s\n\n%sPaper text:\n%s", sys, rules, header, paperText)
}
