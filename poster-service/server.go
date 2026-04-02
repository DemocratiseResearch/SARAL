package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"saral_go_poster/common"
	"saral_go_poster/pipelines/poster"
)

type Server struct {
	geminiKey string
	uploadDir string
}

func NewServer() *Server {
	if err := common.LoadEnv(".env"); err != nil {
		log.Println("No .env file found")
	}

	geminiKey := os.Getenv("GEMINI_API_KEY")
	if geminiKey == "" {
		log.Fatal("GEMINI_API_KEY not set")
	}

	uploadDir := "./uploads"
	os.MkdirAll(uploadDir, 0755)

	return &Server{
		geminiKey: geminiKey,
		uploadDir: uploadDir,
	}
}

func (s *Server) handlePosterDirect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form
	r.ParseMultipartForm(100 << 20)

	file, header, err := r.FormFile("pdf")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get PDF file: " + err.Error(),
		})
		return
	}
	defer file.Close()

	if filepath.Ext(header.Filename) != ".pdf" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Only PDF files are accepted",
		})
		return
	}

	// Create temporary files for processing
	jobID := fmt.Sprintf("%d", time.Now().UnixNano())
	pdfPath := filepath.Join(s.uploadDir, jobID+"_"+header.Filename)
	outputDir := "./output/output_" + jobID

	dst, err := os.Create(pdfPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to save file: " + err.Error(),
		})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to save file: " + err.Error(),
		})
		return
	}
	dst.Close() // Close before processing

	// Process poster pipeline synchronously
	templateType := r.FormValue("template")
	if templateType == "" {
		templateType = "default"
	}

	config := common.PipelineConfig{
		PDFPath:   pdfPath,
		OutputDir: outputDir,
		GeminiKey: s.geminiKey,
		Mode:      "poster",
		Template:  templateType,
	}

	log.Printf("[Direct Poster] Processing %s", header.Filename)
	err = poster.ProcessPosterPipeline(config)

	if err != nil {
		log.Printf("[Direct Poster] Failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":  "Poster generation failed: " + err.Error(),
			"job_id": jobID,
		})
		return
	}

	// Compute poster names (used by both rnd zip and pdf paths)
	baseName := filepath.Base(pdfPath)
	baseName = baseName[:len(baseName)-len(filepath.Ext(baseName))]
	posterName := baseName + "_poster"
	posterPDFPath := filepath.Join(outputDir, "poster", posterName+".pdf")

	// For R&D template, return a zip of the source files instead of a compiled PDF
	if templateType == "rnd" {
		posterDir := filepath.Join(outputDir, "poster")
		texFile := filepath.Join(posterDir, posterName+".tex")
		sty1 := filepath.Join(posterDir, "beamerthemerndshowcase.sty")
		sty2 := filepath.Join(posterDir, "beamercolorthemerndshowcase.sty")

		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		filesToZip := []string{texFile, sty1, sty2, posterPDFPath}
		// Include all PNG images the generator copied into posterDir
		// (rnd_header.png + any extracted paper figures)
		if pngs, err := filepath.Glob(filepath.Join(posterDir, "*.png")); err == nil {
			filesToZip = append(filesToZip, pngs...)
		}
		for _, f := range filesToZip {
			data, err := os.ReadFile(f)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Failed to read source file: " + err.Error(),
				})
				return
			}
			ze, err := zw.Create(filepath.Base(f))
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Failed to create zip entry: " + err.Error(),
				})
				return
			}
			ze.Write(data)
		}
		zw.Close()

		zipBytes := buf.Bytes()
		log.Printf("[Direct Poster] Success! Returning zip of source files (%d bytes)", len(zipBytes))
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, posterName))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(zipBytes)))
		w.Header().Set("X-Job-ID", jobID)
		w.Write(zipBytes)
		return
	}

	// Find the generated PDF
	if _, err := os.Stat(posterPDFPath); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":  "Poster PDF was not generated",
			"job_id": jobID,
		})
		return
	}

	// Read the PDF file
	pdfData, err := os.ReadFile(posterPDFPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":  "Failed to read generated PDF: " + err.Error(),
			"job_id": jobID,
		})
		return
	}

	// Return the PDF
	log.Printf("[Direct Poster] Success! Returning PDF (%d bytes)", len(pdfData))
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pdf"`, posterName))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pdfData)))
	w.Header().Set("X-Job-ID", jobID)
	w.Header().Set("X-Output-Dir", outputDir)
	w.Write(pdfData)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"goroutines": runtime.NumGoroutine(),
	})
}

func StartServer(addr string, numWorkers int) {
	server := NewServer()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/poster", server.handlePosterDirect) // Direct PDF response
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"service": "Go Poster Service",
			"status":  "ok",
			"health":  "GET /health",
			"poster":  "POST /poster (with pdf form field)",
		})
	})

	httpServer := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Minute,
		WriteTimeout: 5 * time.Minute,
	}

	log.Printf("Poster Service starting on %s", addr)
	log.Printf("POST to /poster with 'pdf' form field to generate poster")

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
