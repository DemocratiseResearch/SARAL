package models

// PodcastTurn represents a single speaker turn in the podcast dialogue.
type PodcastTurn struct {
	Speaker string `json:"speaker"` // "host_a" | "host_b"
	Text    string `json:"text"`
}

// PodcastSpeakerConfig stores the requested/assigned voice settings per host.
type PodcastSpeakerConfig struct {
	Gender string `json:"gender,omitempty"`
	Voice  string `json:"voice,omitempty"`
}

// PodcastSpeakers groups the two podcast hosts.
type PodcastSpeakers struct {
	HostA PodcastSpeakerConfig `json:"host_a,omitempty"`
	HostB PodcastSpeakerConfig `json:"host_b,omitempty"`
}

// PodcastAnalysis stores lightweight dialogue stats for the generated script.
type PodcastAnalysis struct {
	TurnCount                int            `json:"turn_count,omitempty"`
	TotalWords               int            `json:"total_words,omitempty"`
	AverageWordsPerTurn      float64        `json:"average_words_per_turn,omitempty"`
	EstimatedDurationSeconds int            `json:"estimated_duration_seconds,omitempty"`
	SpeakerTurnCounts        map[string]int `json:"speaker_turn_counts,omitempty"`
	SpeakerWordCounts        map[string]int `json:"speaker_word_counts,omitempty"`
}

// PodcastScript represents the generated podcast dialogue structure.
type PodcastScript struct {
	RunID       string          `json:"run_id"`
	Title       string          `json:"title"`
	Language    string          `json:"language"`
	RenderVideo *bool           `json:"render_video,omitempty"`
	Speakers    PodcastSpeakers `json:"speakers,omitempty"`
	Analysis    PodcastAnalysis `json:"analysis,omitempty"`
	Turns       []PodcastTurn   `json:"turns"`
}
