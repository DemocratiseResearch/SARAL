package common

type SectionData struct {
	Title   string
	Script  string
	Bullets []string
	Image   string // Path to image file
}

type PipelineConfig struct {
	PDFPath   string
	OutputDir string
	GeminiKey string
	SarvamKey string
	OpenAIKey string // Optional
	Mode      string // "video" or "poster"
	Template  string // "default" or "rnd"
}

// Standard section order for academic papers
const (
	SecIntro      = "Introduction"
	SecMethod     = "Methodology"
	SecResults    = "Results"
	SecDiscussion = "Discussion"
	SecConclusion = "Conclusion"
)

// Poster-specific sections
const (
	SecAbstract   = "Abstract"
	SecBackground = "Background"
	SecObjectives = "Objectives"
	SecReferences = "References"
)

// SectionOrder returns the standard order for video pipeline sections
func SectionOrder() []string {
	return []string{SecIntro, SecMethod, SecResults, SecDiscussion, SecConclusion}
}

// PosterSectionOrder returns the standard order for poster sections
func PosterSectionOrder() []string {
	return []string{SecAbstract, SecIntro, SecMethod, SecResults, SecConclusion, SecReferences}
}
