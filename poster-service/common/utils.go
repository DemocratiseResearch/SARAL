package common

import (
	"image"
	"image/draw"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Constants for YOLO detection
const (
	ConfThreshold = 0.30
	NMSThreshold  = 0.45
	MinBoxSize    = 30
)

var ClassNames = []string{
	"Caption", "Footnote", "Formula", "List-item", "Page-footer",
	"Page-header", "Picture", "Section-header", "Table", "Text", "Title",
}

type PdfRect struct {
	X0, Y0, X1, Y1 float64
}

// Max returns the larger of two integers
func Max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// CropImage crops an image to the specified rectangle
func CropImage(img image.Image, rect image.Rectangle) image.Image {
	intersect := rect.Intersect(img.Bounds())
	if intersect.Empty() {
		return image.NewRGBA(image.Rect(0, 0, 1, 1))
	}
	type subImager interface {
		SubImage(r image.Rectangle) image.Image
	}
	if si, ok := img.(subImager); ok {
		return si.SubImage(intersect)
	}
	dst := image.NewRGBA(image.Rect(0, 0, intersect.Dx(), intersect.Dy()))
	draw.Draw(dst, dst.Bounds(), img, intersect.Min, draw.Src)
	return dst
}

// SaveImage saves an image to the specified path
func SaveImage(path string, img image.Image) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}

// ParseYOLOOutput parses YOLO model output into bounding boxes
func ParseYOLOOutput(data []float32, imgW, imgH, dx, dy int, scale float64) ([]image.Rectangle, []int, []float32) {
	channels := 15
	anchors := 21504

	var boxes []image.Rectangle
	var classIds []int
	var confidences []float32

	for j := 0; j < anchors; j++ {
		maxScore := float32(0.0)
		maxClassID := -1
		for k := 4; k < channels; k++ {
			score := data[k*anchors+j]
			if score > maxScore {
				maxScore = score
				maxClassID = k - 4
			}
		}

		if maxScore > ConfThreshold {
			cx := data[0*anchors+j]
			cy := data[1*anchors+j]
			w := data[2*anchors+j]
			h := data[3*anchors+j]

			cx = cx - float32(dx)
			cy = cy - float32(dy)

			cx = cx / float32(scale)
			cy = cy / float32(scale)
			w = w / float32(scale)
			h = h / float32(scale)

			x := (cx - w/2)
			y := (cy - h/2)

			if x < 0 {
				x = 0
			}
			if y < 0 {
				y = 0
			}

			rect := image.Rect(int(x), int(y), int(x+w), int(y+h))

			boxes = append(boxes, rect)
			classIds = append(classIds, maxClassID)
			confidences = append(confidences, maxScore)
		}
	}
	return boxes, classIds, confidences
}

// LoadEnv loads environment variables from a file
func LoadEnv(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, "'\"")
			os.Setenv(key, val)
		}
	}
	return nil
}

// ParseScriptToSections parses the generated script into sections
func ParseScriptToSections(script string) map[string]SectionData {
	sections := make(map[string]SectionData)
	lines := strings.Split(script, "\n")

	currentSection := ""
	var currentBuffer strings.Builder

	keywords := SectionOrder()

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		isHeader := false
		for _, kw := range keywords {
			if strings.EqualFold(strings.Trim(trimmed, ":#* "), kw) {
				if currentSection != "" {
					sections[currentSection] = SectionData{Script: currentBuffer.String()}
				}
				currentSection = kw
				currentBuffer.Reset()
				isHeader = true
				break
			}
		}

		if !isHeader {
			currentBuffer.WriteString(line)
			currentBuffer.WriteString("\n")
		}
	}
	if currentSection != "" {
		sections[currentSection] = SectionData{Script: currentBuffer.String()}
	}

	return sections
}

// EscapeLatex escapes special LaTeX characters in text
func EscapeLatex(text string) string {
	// Order matters! Backslash must be replaced first
	replacements := []struct{ old, new string }{
		{"\\", "\\textbackslash{}"},
		{"&", "\\&"},
		{"%", "\\%"},
		{"$", "\\$"},
		{"#", "\\#"},
		{"_", "\\_"},
		{"{", "\\{"},
		{"}", "\\}"},
		{"~", "\\textasciitilde{}"},
		{"^", "\\textasciicircum{}"},
	}
	for _, r := range replacements {
		text = strings.ReplaceAll(text, r.old, r.new)
	}
	return text
}
