package poster

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"saral_go_poster/common"
)

// ProcessPosterPipeline executes the PDF to Poster workflow
func ProcessPosterPipeline(config common.PipelineConfig) error {
	// Ensure OutputDir exists
	if err := os.MkdirAll(config.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}
	log.Printf("Starting poster pipeline for %s -> %s", config.PDFPath, config.OutputDir)

	// 1. Process PDF for text
	log.Println("Step 1: Processing PDF...")
	pdfProc, err := common.NewPDFProcessor(config.PDFPath, config.OutputDir)
	if err != nil {
		return fmt.Errorf("failed to open PDF: %w", err)
	}
	defer pdfProc.Close()

	// Extract text
	text, err := pdfProc.ExtractText()
	if err != nil {
		return fmt.Errorf("text extraction failed: %w", err)
	}
	log.Printf("Extracted %d chars of text", len(text))

	if text == "" {
		return fmt.Errorf("no text extracted from PDF")
	}

	// 2. Extract images using YOLO model
	log.Println("Step 2: Extracting images using YOLO detection...")
	var imagePaths []string

	modelPath := "yolov8n-doclaynet.onnx"
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		log.Printf("Warning: YOLO model not found at %s, skipping image extraction", modelPath)
	} else {
		extractor, err := NewImageExtractor(modelPath)
		if err != nil {
			log.Printf("Warning: Failed to initialize image extractor: %v", err)
		} else {
			defer extractor.Close()

			imagePaths, err = extractor.ExtractImagesFromPDF(config.PDFPath, config.OutputDir)
			if err != nil {
				log.Printf("Warning: Image extraction failed: %v", err)
				imagePaths = []string{}
			}
		}
	}
	log.Printf("Extracted %d images (Pictures/Tables)", len(imagePaths))

	// 3. Generate poster content with AI
	log.Println("Step 3: Generating poster content with Gemini...")
	gemini, err := common.NewGeminiClient(config.GeminiKey)
	if err != nil {
		return fmt.Errorf("gemini init failed: %w", err)
	}
	defer gemini.Close()

	posterContent, err := gemini.GeneratePosterContent(text)
	if err != nil {
		return fmt.Errorf("poster content generation failed: %w", err)
	}

	// Log generated content summary
	log.Printf("Generated poster content:")
	log.Printf("  Title: %s", posterContent.Title)
	log.Printf("  Introduction: %d points", len(posterContent.Introduction))
	log.Printf("  Methodology: %d points", len(posterContent.Methodology))
	log.Printf("  Results: %d points", len(posterContent.Results))
	log.Printf("  Conclusion: %d points", len(posterContent.Conclusion))

	// Save content for debugging
	os.WriteFile(filepath.Join(config.OutputDir, "poster_content.txt"),
		[]byte(formatPosterContent(posterContent)), 0644)

	// 4. Generate poster
	log.Println("Step 4: Generating LaTeX poster...")
	posterDir := filepath.Join(config.OutputDir, "poster")

	// Use base name of PDF as poster name
	baseName := strings.TrimSuffix(filepath.Base(config.PDFPath), filepath.Ext(config.PDFPath))
	posterName := baseName + "_poster"

	var pdfPath string
	if config.Template == "rnd" {
		log.Println("Using R&D Showcase template")
	} else {
		log.Println("Using default template")
		posterGen := NewPosterGenerator(posterDir)
		pdfPath, err = posterGen.GeneratePoster(posterContent, imagePaths, posterName)
	}
	if err != nil {
		return fmt.Errorf("poster generation failed: %w", err)
	}

	log.Printf("Poster Pipeline Complete! Output: %s", pdfPath)
	return nil
}

// formatPosterContent formats the poster content for debugging output
func formatPosterContent(content *common.PosterContent) string {
	var sb strings.Builder

	sb.WriteString("=== POSTER CONTENT ===\n\n")
	sb.WriteString(fmt.Sprintf("TITLE: %s\n\n", content.Title))
	sb.WriteString(fmt.Sprintf("AUTHORS: %s\n\n", content.Authors))
	sb.WriteString(fmt.Sprintf("ABSTRACT:\n%s\n\n", content.Abstract))

	sb.WriteString("INTRODUCTION:\n")
	for _, point := range content.Introduction {
		sb.WriteString(fmt.Sprintf("- %s\n", point))
	}
	sb.WriteString("\n")

	sb.WriteString("METHODOLOGY:\n")
	for _, point := range content.Methodology {
		sb.WriteString(fmt.Sprintf("- %s\n", point))
	}
	sb.WriteString("\n")

	sb.WriteString("RESULTS:\n")
	for _, point := range content.Results {
		sb.WriteString(fmt.Sprintf("- %s\n", point))
	}
	sb.WriteString("\n")

	sb.WriteString("CONCLUSION:\n")
	for _, point := range content.Conclusion {
		sb.WriteString(fmt.Sprintf("- %s\n", point))
	}
	sb.WriteString("\n")

	sb.WriteString("REFERENCES:\n")
	for _, ref := range content.References {
		sb.WriteString(fmt.Sprintf("- %s\n", ref))
	}

	return sb.String()
}
