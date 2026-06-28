package config

import (
	"encoding/json"
	"fmt"
	"os"
)

// PromptConfig is the top-level structure loaded from prompts.json.
type PromptConfig struct {
	System        string                    `json:"system"`
	AudienceHints map[string]AudienceHint   `json:"audience_hints"`
	ToneHints     map[string]ToneHint       `json:"tone_hints"`
	Instructions  []string                  `json:"instructions"`
	Podcast       PodcastPromptConfig       `json:"podcast"`
	Reel          ReelPromptConfig          `json:"reel"`
	SlidesDeck    SlidesDeckPromptConfig    `json:"slides_deck"`
	Poster        PosterPromptConfig        `json:"poster"`
	LinkedIn      string                    `json:"linkedin"`
	Twitter       string                    `json:"twitter"`
	BusinessBrief BusinessBriefPromptConfig `json:"business_brief"`
	Patent        PatentPromptConfig        `json:"patent"`
}

// AudienceHint controls depth of generated content (novice / intermediate / expert).
type AudienceHint struct {
	Narration string `json:"narration"`
	Bullets   string `json:"bullets"`
}

// ToneHint controls the register of generated content (formal / conversational).
// Orthogonal to AudienceHint — audience controls depth, tone controls voice.
type ToneHint struct {
	Narration string `json:"narration"`
	Podcast   string `json:"podcast"`
}

type PodcastPromptConfig struct {
	System       string      `json:"system"`
	Schema       interface{} `json:"schema"`
	Instructions []string    `json:"instructions"`
}

type ReelPromptConfig struct {
	System       string      `json:"system"`
	Schema       interface{} `json:"schema"`
	Instructions []string    `json:"instructions"`
}

type SlidesDeckPromptConfig struct {
	System       string   `json:"system"`
	Instructions []string `json:"instructions"`
}

type PosterPromptConfig struct {
	System string   `json:"system"`
	Rules  []string `json:"rules"`
}

type BusinessBriefPromptConfig struct {
	Model          string   `json:"model"`
	PromptTemplate string   `json:"prompt_template"`
	Sections       []string `json:"sections"`
}

type PatentPromptConfig struct {
	Model                string   `json:"model"`
	Sections             []string `json:"sections"`
	PromptTemplate       string   `json:"prompt_template"`
	BulletPromptTemplate string   `json:"bullet_prompt_template"`
}

// Load reads and parses the prompts config file at the given path.
func Load(path string) (PromptConfig, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return PromptConfig{}, fmt.Errorf("read prompts config: %w", err)
	}
	var cfg PromptConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return PromptConfig{}, fmt.Errorf("parse prompts config: %w", err)
	}
	return cfg, nil
}
