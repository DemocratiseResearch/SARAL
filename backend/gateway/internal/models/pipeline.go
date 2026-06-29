package models

// Section represents a paper section with script content for presentation/TTS.
type Section struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Narration string   `json:"narration"`
	Bullets   []string `json:"bullets"`
}

// Script is the generated paper-to-video narration structure.
type Script struct {
	RunID            string            `json:"run_id"`
	AudienceLevel    string            `json:"audience_level,omitempty"`
	Tone             string            `json:"tone,omitempty"`
	Title            string            `json:"title,omitempty"`
	Authors          string            `json:"authors,omitempty"`
	Date             string            `json:"date,omitempty"`
	TitleIntro       string            `json:"title_intro,omitempty"`
	Sections         []Section         `json:"sections"`
	ImageAssignments map[string]string `json:"image_assignments,omitempty"`
	Language         string            `json:"language,omitempty"`
	SlideLanguage    string            `json:"slide_language,omitempty"`
	OutputFormat     string            `json:"output_format,omitempty"`
	PPTTemplate      string            `json:"ppt_template,omitempty"`
	VoiceGender      string            `json:"voice_gender,omitempty"`
}

// ExtractedDocument mirrors the output of pdf_extract.
type ExtractedDocument struct {
	Text        string   `json:"text"`
	NumPages    int      `json:"num_pages"`
	ImagePaths  []string `json:"image_paths"`
	TextGCSPath string   `json:"text_gcs_path"`
}

type AudioSlide struct {
	FrameIndex int      `json:"frame_index"`
	Text       string   `json:"text,omitempty"`
	AudioPaths []string `json:"audio_paths"`
}

type AudioManifest struct {
	RunID  string       `json:"run_id"`
	Slides []AudioSlide `json:"slides"`
}

// PosterContent is the structured output from script_gen for a poster run.
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
