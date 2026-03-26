package common

import (
	"fmt"
	"image"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gen2brain/go-fitz"
)

// PDFProcessor handles PDF operations
type PDFProcessor struct {
	Path      string
	OutputDir string
	Doc       *SafeDocument
	NumPages  int
}

// SafeDocument wraps fitz.Document with a mutex for thread safety
type SafeDocument struct {
	doc *fitz.Document
	mu  sync.Mutex
}

// NewPDFProcessor initializes the processor
func NewPDFProcessor(path, outputDir string) (*PDFProcessor, error) {
	doc, err := fitz.New(path)
	if err != nil {
		return nil, fmt.Errorf("error opening PDF: %w", err)
	}

	absOutput, _ := filepath.Abs(outputDir)
	return &PDFProcessor{
		Path:      path,
		OutputDir: absOutput,
		Doc:       &SafeDocument{doc: doc},
		NumPages:  doc.NumPage(),
	}, nil
}

// Close cleans up resources
func (p *PDFProcessor) Close() {
	if p.Doc != nil && p.Doc.doc != nil {
		p.Doc.doc.Close()
	}
}

// ExtractText extracts all text from the PDF
func (p *PDFProcessor) ExtractText() (string, error) {
	var sb strings.Builder
	for i := 0; i < p.NumPages; i++ {
		text, err := p.Doc.doc.Text(i)
		if err != nil {
			return "", fmt.Errorf("error extracting text from page %d: %w", i, err)
		}
		sb.WriteString(text)
		sb.WriteString("\n")
	}
	return sb.String(), nil
}

// ExtractTextByPage extracts text from a specific page
func (p *PDFProcessor) ExtractTextByPage(pageNum int) (string, error) {
	p.Doc.mu.Lock()
	defer p.Doc.mu.Unlock()

	if pageNum < 0 || pageNum >= p.NumPages {
		return "", fmt.Errorf("page number %d out of range", pageNum)
	}
	return p.Doc.doc.Text(pageNum)
}

// ExtractPageImage renders a page as an image
func (p *PDFProcessor) ExtractPageImage(pageNum int, dpi int) (image.Image, error) {
	p.Doc.mu.Lock()
	defer p.Doc.mu.Unlock()

	if pageNum < 0 || pageNum >= p.NumPages {
		return nil, fmt.Errorf("page number %d out of range", pageNum)
	}

	img, err := p.Doc.doc.Image(pageNum)
	if err != nil {
		return nil, fmt.Errorf("error rendering page %d: %w", pageNum, err)
	}
	return img, nil
}

// ExtractAllPageImages extracts all pages as images
func (p *PDFProcessor) ExtractAllPageImages(dpi int) ([]image.Image, error) {
	var images []image.Image

	for i := 0; i < p.NumPages; i++ {
		img, err := p.ExtractPageImage(i, dpi)
		if err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, nil
}

// NumPage returns the number of pages
func (s *SafeDocument) NumPage() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doc.NumPage()
}

// ImagePNG returns a page as PNG bytes
func (s *SafeDocument) ImagePNG(pageNum int, dpi float64) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doc.ImagePNG(pageNum, dpi)
}
