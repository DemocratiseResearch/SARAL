package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/saral/audio-gen/sarvam"
	"github.com/saral/audio-gen/wav"
)

// translateText translates English text to lang.
// Returns text unchanged when lang == "en-IN" (no translation needed).
//
// Routing (controlled by TRANSLATION_PROVIDER env var):
//   - "sarvam" (default): mayura:v1 for core Indic langs (classic-colloquial),
//     sarvam-translate:v1 for extended langs (formal).
//   - "bhashini": Bhashini MT for core Indic langs (A/B testing path);
//     extended langs automatically fall through to Sarvam translate.
//
// useInternationalNumerals passes numerals_format=international to Sarvam
// when the text contains digit characters.
func translateText(text, lang string, useInternationalNumerals bool, client *sarvam.Client) (string, error) {
	if lang == "en-IN" {
		return text, nil
	}
	if isPortugueseLang(lang) {
		geminiSem <- struct{}{}
		defer func() { <-geminiSem }()
		return geminiClient.Translate(text, lang)
	}
	// A/B testing: use Bhashini MT for core Indic languages when requested.
	if translationProvider == "bhashini" && sarvam.MayuraV1Languages[lang] {
		displayName := sarvam.LanguageToDisplayName[lang]
		if displayName == "" {
			displayName = lang
		}
		return bhashiniReg.Translate(text, displayName)
	}
	// Manipuri (mni-IN): Sarvam translate outputs Meitei script (Meitei Mayek)
	// but the Bhashini TTS model (IITM_TTS_Manipuri) was trained on Bengali-script
	// Manipuri. Always use Bhashini MT which produces the correct Bengali script.
	if lang == "mni-IN" {
		return bhashiniReg.Translate(text, "Manipuri_Bengali")
	}
	return client.Translate(text, lang, useInternationalNumerals)
}

// maleVoices is the set of speaker names that map to "male" gender.
// Derived from voice.malePool — keep in sync if the pool changes.
var maleVoices = map[string]bool{"aditya": true, "shubh": true, "aayan": true}

// synthesizeTTS calls TTS for translated text.
// Uses Sarvam bulbul:v3 for the 11 supported languages, Bhashini TTS for the
// 8 extended languages (as-IN, brx-IN, doi-IN, mai-IN, mni-IN, sa-IN, sat-IN, ur-IN).
func synthesizeTTS(text, lang, speaker string, client *sarvam.Client) ([]byte, error) {
	if isPortugueseLang(lang) {
		geminiSem <- struct{}{}
		defer func() { <-geminiSem }()
		return geminiClient.Synthesize(text, lang, speaker)
	}
	if sarvam.SarvamLanguages[lang] != "" {
		return client.Synthesize(text, lang, speaker)
	}
	// Extended languages not supported by Sarvam TTS → Bhashini TTS.
	gender := "female"
	if maleVoices[speaker] {
		gender = "male"
	}
	return bhashiniReg.SynthesizeTTS(text, lang, gender)
}

func synthesizeSlide(
	ctx context.Context,
	narration, lang, speaker string,
	runID, userID, paperID string,
	frameIndex int,
	client *sarvam.Client,
) ([]string, error) {
	chunks := splitText(narration, maxChunkRune)
	log.Printf("[audio-gen][%s] slide=%d splitting narration: runes=%d chunks=%d speaker=%q lang=%s provider=%s",
		runID, frameIndex, utf8.RuneCountInString(narration), len(chunks), speaker, lang, translationProvider)

	runUUID, _ := uuid.Parse(runID)
	var audioPaths []string
	uploadIdx := 0

	uploadAudio := func(audioBytes []byte, label string) error {
		objKey := fmt.Sprintf("%s/%s/runs/%s/audio_gen/slide_%d_chunk_%d.wav",
			userID, paperID, runUUID, frameIndex, uploadIdx)
		log.Printf("[audio-gen][%s] slide=%d %s uploading to GCS: %s", runID, frameIndex, label, objKey)
		gcsPath, err := uploadGCS(ctx, audioBytes, objKey, "audio/wav")
		if err != nil {
			log.Printf("[audio-gen][%s] slide=%d %s GCS upload FAILED: %v", runID, frameIndex, label, err)
			return fmt.Errorf("upload audio chunk: %w", err)
		}
		log.Printf("[audio-gen][%s] slide=%d %s uploaded: %s", runID, frameIndex, label, gcsPath)
		audioPaths = append(audioPaths, gcsPath)
		uploadIdx++
		return nil
	}

	for chunkIdx, chunk := range chunks {
		log.Printf("[audio-gen][%s] slide=%d chunk=%d/%d runes=%d synthesizing...",
			runID, frameIndex, chunkIdx+1, len(chunks), utf8.RuneCountInString(chunk))

		translated, tErr := translateText(chunk, lang, containsDigits(chunk), client)
		if tErr != nil {
			log.Printf("[audio-gen][%s] slide=%d chunk=%d translate FAILED: %v | preview=%q",
				runID, frameIndex, chunkIdx, tErr, truncate(chunk, 80))
			return nil, fmt.Errorf("translate chunk %d: %w", chunkIdx, tErr)
		}
		log.Printf("[audio-gen][%s] slide=%d chunk=%d translated: runes=%d",
			runID, frameIndex, chunkIdx, utf8.RuneCountInString(translated))

		// Re-split after translation: translated text may be longer than source
		// (Indic scripts expand), which could exceed the TTS char limit.
		// Bhashini models crash above ~300 chars so use a tighter limit.
		chunkLimit := maxChunkRune
		if _, isSarvam := sarvam.SarvamLanguages[lang]; !isSarvam {
			chunkLimit = bhashiniMaxChunkRune
		}
		translatedChunks := splitText(translated, chunkLimit)
		if len(translatedChunks) > 1 {
			log.Printf("[audio-gen][%s] slide=%d chunk=%d re-split into %d TTS sub-chunks",
				runID, frameIndex, chunkIdx, len(translatedChunks))
		}
		for tcIdx, tc := range translatedChunks {
			label := fmt.Sprintf("chunk=%d sub=%d", chunkIdx, tcIdx)
			audioBytes, err := synthesizeTTS(tc, lang, speaker, client)
			if err != nil {
				log.Printf("[audio-gen][%s] slide=%d %s TTS FAILED: %v | preview=%q",
					runID, frameIndex, label, err, truncate(tc, 80))
				// Manipuri-only: Bhashini's IIT-M TTS occasionally 5xx's on
				// chunks with mixed Latin tokens or punctuation. Substitute a
				// silent WAV of estimated duration so the slide still completes
				// instead of aborting the whole run.
				if lang == "mni-IN" {
					estSec := float64(utf8.RuneCountInString(tc)) / 11.0
					silence := wav.BuildSilence(estSec)
					log.Printf("[audio-gen][%s] slide=%d %s using %.2fs silence fallback", runID, frameIndex, label, estSec)
					if upErr := uploadAudio(silence, label); upErr != nil {
						return nil, upErr
					}
					continue
				}
				return nil, fmt.Errorf("TTS chunk %d sub %d: %w", chunkIdx, tcIdx, err)
			}
			log.Printf("[audio-gen][%s] slide=%d %s TTS ok: audio_bytes=%d", runID, frameIndex, label, len(audioBytes))
			if err := uploadAudio(audioBytes, label); err != nil {
				return nil, err
			}
		}
	}

	log.Printf("[audio-gen][%s] slide=%d all chunks done: total_paths=%d", runID, frameIndex, len(audioPaths))
	return audioPaths, nil
}

func containsDigits(s string) bool {
	for _, r := range s {
		if r >= '0' && r <= '9' {
			return true
		}
	}
	return false
}

func isPortugueseLang(lang string) bool {
	return lang == "pt-BR" || lang == "pt-PT" || lang == "pt"
}

func geminiMaxConcurrent() int {
	raw := strings.TrimSpace(os.Getenv("GEMINI_MAX_CONCURRENT"))
	if raw == "" {
		return 2
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 2
	}
	if n > maxConcurrent {
		return maxConcurrent
	}
	return n
}

// splitText splits narration into chunks of at most maxRunes UTF-8 characters,
// preferring sentence boundaries.
func splitText(text string, maxRunes int) []string {
	if utf8.RuneCountInString(text) <= maxRunes {
		return []string{text}
	}

	var chunks []string
	runes := []rune(text)
	start := 0
	for start < len(runes) {
		end := start + maxRunes
		if end >= len(runes) {
			chunks = append(chunks, string(runes[start:]))
			break
		}
		cutAt := end
		for cutAt > start && runes[cutAt] != '.' && runes[cutAt] != '!' && runes[cutAt] != '?' {
			cutAt--
		}
		if cutAt == start {
			cutAt = end
		} else {
			cutAt++
		}
		chunks = append(chunks, strings.TrimSpace(string(runes[start:cutAt])))
		start = cutAt
	}
	return chunks
}
