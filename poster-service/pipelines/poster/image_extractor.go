package poster

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/gen2brain/go-fitz"
	ort "github.com/yalue/onnxruntime_go"
	"gocv.io/x/gocv"
)

// ImageExtractor handles YOLO-based image/table extraction from PDFs
type ImageExtractor struct {
	ModelPath     string
	ConfThreshold float32
	NMSThreshold  float32
	MinBoxSize    int
	session       *ort.DynamicAdvancedSession
}

// ClassNames for DocLayNet model
var ClassNames = []string{
	"Caption", "Footnote", "Formula", "List-item", "Page-footer",
	"Page-header", "Picture", "Section-header", "Table", "Text", "Title",
}

// NewImageExtractor creates a new YOLO-based image extractor
func NewImageExtractor(modelPath string) (*ImageExtractor, error) {
	// Initialize ONNX Runtime
	libPath := "/opt/homebrew/lib/libonnxruntime.dylib"
	if runtime.GOOS == "linux" {
		libPath = "/usr/lib/libonnxruntime.so"
	}

	ort.SetSharedLibraryPath(libPath)
	if err := ort.InitializeEnvironment(); err != nil {
		return nil, fmt.Errorf("failed to initialize ONNX Runtime: %w", err)
	}

	session, err := ort.NewDynamicAdvancedSession(modelPath,
		[]string{"images"}, []string{"output0"}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create ONNX session: %w", err)
	}

	return &ImageExtractor{
		ModelPath:     modelPath,
		ConfThreshold: 0.30,
		NMSThreshold:  0.45,
		MinBoxSize:    30,
		session:       session,
	}, nil
}

// Close cleans up resources
func (e *ImageExtractor) Close() {
	if e.session != nil {
		e.session.Destroy()
	}
	ort.DestroyEnvironment()
}

// SafeDocument wraps fitz.Document with a mutex for thread safety
type SafeDocument struct {
	doc *fitz.Document
	mu  sync.Mutex
}

func (s *SafeDocument) Image(n int) (image.Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doc.Image(n)
}

func (s *SafeDocument) ImagePNG(n int, dpi float64) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doc.ImagePNG(n, dpi)
}

func (s *SafeDocument) NumPage() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doc.NumPage()
}

// ExtractImagesFromPDF extracts Pictures and Tables from a PDF using YOLO detection
func (e *ImageExtractor) ExtractImagesFromPDF(pdfPath, outputDir string) ([]string, error) {
	// Open PDF
	rawDoc, err := fitz.New(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("error opening PDF: %w", err)
	}
	defer rawDoc.Close()
	doc := &SafeDocument{doc: rawDoc}

	// Create output directories
	imagesDir := filepath.Join(outputDir, "extracted_images")
	os.MkdirAll(imagesDir, 0755)

	numPages := doc.NumPage()
	var allPaths []string
	var pathsMutex sync.Mutex

	// Use worker pool for concurrency
	numWorkers := runtime.NumCPU()
	jobs := make(chan int, numPages)
	var wg sync.WaitGroup

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for pageNum := range jobs {
				paths := e.processPage(doc, pageNum, imagesDir)
				if len(paths) > 0 {
					pathsMutex.Lock()
					allPaths = append(allPaths, paths...)
					pathsMutex.Unlock()
				}
			}
		}()
	}

	for i := 0; i < numPages; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	return allPaths, nil
}

func (e *ImageExtractor) processPage(doc *SafeDocument, pageNum int, outputDir string) []string {
	var paths []string

	// Render page
	img, err := doc.Image(pageNum)
	if err != nil {
		return nil
	}

	// Preprocess with GoCV
	mat, err := gocv.ImageToMatRGB(img)
	if err != nil {
		return nil
	}
	defer mat.Close()

	// Letterbox Resize
	originalW, originalH := mat.Cols(), mat.Rows()
	inputSize := 1024

	scale := float64(inputSize) / float64(max(originalW, originalH))
	newW := int(float64(originalW) * scale)
	newH := int(float64(originalH) * scale)

	resized := gocv.NewMat()
	defer resized.Close()
	gocv.Resize(mat, &resized, image.Pt(newW, newH), 0, 0, gocv.InterpolationLinear)

	canvas := gocv.NewMatWithSizeFromScalar(gocv.NewScalar(114, 114, 114, 0), inputSize, inputSize, gocv.MatTypeCV8UC3)
	defer canvas.Close()

	dx := (inputSize - newW) / 2
	dy := (inputSize - newH) / 2

	roi := canvas.Region(image.Rect(dx, dy, dx+newW, dy+newH))
	resized.CopyTo(&roi)
	roi.Close()

	// Prepare Tensor Data
	bgr := gocv.Split(canvas)
	defer bgr[0].Close()
	defer bgr[1].Close()
	defer bgr[2].Close()

	inputData := make([]float32, 1*3*1024*1024)

	for c := 0; c < 3; c++ {
		fMat := gocv.NewMat()
		bgr[c].ConvertTo(&fMat, gocv.MatTypeCV32F)
		fMat.MultiplyFloat(1.0 / 255.0)

		data, _ := fMat.DataPtrFloat32()
		offset := c * 1024 * 1024
		copy(inputData[offset:], data)
		fMat.Close()
	}

	// Inference
	inputTensor, err := ort.NewTensor(ort.NewShape(1, 3, 1024, 1024), inputData)
	if err != nil {
		return nil
	}
	defer inputTensor.Destroy()

	outputData := make([]float32, 1*15*21504)
	outputTensor, err := ort.NewTensor(ort.NewShape(1, 15, 21504), outputData)
	if err != nil {
		return nil
	}
	defer outputTensor.Destroy()

	if err := e.session.Run([]ort.Value{inputTensor}, []ort.Value{outputTensor}); err != nil {
		return nil
	}

	// Post-processing
	outFloats := outputTensor.GetData()
	boxes, classIds, confidences := e.parseYOLOOutput(outFloats, originalW, originalH, dx, dy, scale)

	var indices []int
	if len(boxes) > 0 {
		indices = gocv.NMSBoxes(boxes, confidences, e.ConfThreshold, e.NMSThreshold)
	}

	for _, idx := range indices {
		classID := classIds[idx]
		label := ClassNames[classID]
		box := boxes[idx]

		// Only extract Pictures and Tables
		if label != "Picture" && label != "Table" {
			continue
		}

		// Filter small artifacts
		if (box.Max.X-box.Min.X) < e.MinBoxSize || (box.Max.Y-box.Min.Y) < e.MinBoxSize {
			continue
		}

		// Extract high-res crop
		hiResBytes, err := doc.ImagePNG(pageNum, 300)
		if err != nil {
			continue
		}

		hiResImg, err := png.Decode(bytes.NewReader(hiResBytes))
		if err != nil {
			continue
		}

		hiResBounds := hiResImg.Bounds()
		extractScaleX := float64(hiResBounds.Dx()) / float64(originalW)
		extractScaleY := float64(hiResBounds.Dy()) / float64(originalH)

		cropRect := image.Rect(
			int(float64(box.Min.X)*extractScaleX), int(float64(box.Min.Y)*extractScaleY),
			int(float64(box.Max.X)*extractScaleX), int(float64(box.Max.Y)*extractScaleY),
		)

		cropped := cropImage(hiResImg, cropRect)
		fName := filepath.Join(outputDir, fmt.Sprintf("p%d_%s_%d.png", pageNum, label, box.Min.X))
		if err := saveImage(fName, cropped); err == nil {
			paths = append(paths, fName)
		}
	}

	return paths
}

func (e *ImageExtractor) parseYOLOOutput(data []float32, imgW, imgH, dx, dy int, scale float64) ([]image.Rectangle, []int, []float32) {
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

		if maxScore > e.ConfThreshold {
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

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func cropImage(img image.Image, rect image.Rectangle) image.Image {
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

func saveImage(path string, img image.Image) error {
	dir := filepath.Dir(path)
	os.MkdirAll(dir, 0755)
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}
