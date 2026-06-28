package models

// ReelTurn is one line of dialogue for the vertical short-form reel.
// Speaker is canonicalized to "Person1" (female) or "Person2" (male).
type ReelTurn struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

// ReelAvatarSelection persists the user's choice of avatar pair for the reel.
// pair is one of: male1_female1, male1_female2, male2_female1, male2_female2.
type ReelAvatarSelection struct {
	Pair    string `json:"pair"`
	Person1 string `json:"person1"` // gs:// path
	Person2 string `json:"person2"` // gs:// path
}

// ReelAnalysis stores lightweight script stats.
type ReelAnalysis struct {
	TurnCount                int            `json:"turn_count,omitempty"`
	TotalWords               int            `json:"total_words,omitempty"`
	AverageWordsPerTurn      float64        `json:"average_words_per_turn,omitempty"`
	EstimatedDurationSeconds int            `json:"estimated_duration_seconds,omitempty"`
	SpeakerTurnCounts        map[string]int `json:"speaker_turn_counts,omitempty"`
	SpeakerWordCounts        map[string]int `json:"speaker_word_counts,omitempty"`
}

// ReelScript is the persisted script JSON for a reel run.
// avatars stays nil until the user calls POST /avatars; finalize requires it set.
type ReelScript struct {
	RunID    string               `json:"run_id"`
	Title    string               `json:"title"`
	Language string               `json:"language"`
	Avatars  *ReelAvatarSelection `json:"avatars,omitempty"`
	Analysis ReelAnalysis         `json:"analysis,omitempty"`
	Turns    []ReelTurn           `json:"turns"`
}

// ReelAvatarPair is a catalog entry. Person1/Person2 are bare PNG filenames

type ReelAvatarPair struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Person1     string `json:"person1"` // female PNG filename
	Person2     string `json:"person2"` // male PNG filename
	Description string `json:"description,omitempty"`
}

// ReelAvatarGCSPrefix is the canonical bucket-relative prefix where the four
// avatar PNGs live. Seeded once via cmd/seed_avatars.
const ReelAvatarGCSPrefix = "assets/avatars/"

// AvailableReelAvatarPairs is the canonical 4-pair catalog.
var AvailableReelAvatarPairs = []ReelAvatarPair{
	{ID: "male1_female1", Name: "Male 1 & Female 1", Person2: "prof1.png", Person1: "prof2.png", Description: "Two-person avatar pair"},
	{ID: "male1_female2", Name: "Male 1 & Female 2", Person2: "prof1.png", Person1: "student2.png", Description: "Two-person avatar pair"},
	{ID: "male2_female1", Name: "Male 2 & Female 1", Person2: "student1.png", Person1: "prof2.png", Description: "Two-person avatar pair"},
	{ID: "male2_female2", Name: "Male 2 & Female 2", Person2: "student1.png", Person1: "student2.png", Description: "Two-person avatar pair"},
}

// ReelAvatarFilenames returns the deduplicated set of PNG filenames the seeder
// must upload. Used by cmd/seed_avatars and any audit tooling.
func ReelAvatarFilenames() []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, p := range AvailableReelAvatarPairs {
		for _, name := range []string{p.Person1, p.Person2} {
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, name)
		}
	}
	return out
}

// LookupReelAvatarPair returns the catalog entry for a pair id, or nil if invalid.
func LookupReelAvatarPair(id string) *ReelAvatarPair {
	for i := range AvailableReelAvatarPairs {
		if AvailableReelAvatarPairs[i].ID == id {
			return &AvailableReelAvatarPairs[i]
		}
	}
	return nil
}
