package main

import (
	"flag"
	"log"
	"os"
	"runtime"

	"saral_go_poster/common"
	"saral_go_poster/pipelines/poster"
)

func main() {
	serverMode := flag.Bool("server", false, "Run as HTTP server")
	port := flag.String("port", ":8082", "Server port (only with --server)")
	workers := flag.Int("workers", runtime.NumCPU(), "Number of worker goroutines (only with --server)")
	flag.Parse()

	if *serverMode {
		StartServer(*port, *workers)
		return
	}

	args := flag.Args()
	if len(args) < 1 {
		log.Fatal("Usage: go run . [--server --port=:8082] or go run . <pdf_path>")
	}
	pdfPath := args[0]

	if err := common.LoadEnv(".env"); err != nil {
		log.Println("No .env file found or error reading it")
	}

	config := common.PipelineConfig{
		PDFPath:   pdfPath,
		OutputDir: "./output/output_" + pdfPath,
		GeminiKey: os.Getenv("GEMINI_API_KEY"),
		Mode:      "poster",
	}

	if config.GeminiKey == "" {
		log.Fatal("Please set GEMINI_API_KEY environment variable")
	}

	log.Println("Running Poster Pipeline...")
	err := poster.ProcessPosterPipeline(config)

	if err != nil {
		log.Fatalf("Pipeline failed: %v", err)
	}

	log.Println("Pipeline completed successfully!")
}
