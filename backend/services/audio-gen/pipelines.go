package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/saral/audio-gen/sarvam"
	"github.com/saral/audio-gen/voice"
	"github.com/saral/audio-gen/wav"
)

// ── Video pipeline ────────────────────────────────────────────────────────────

func runAudioGen(ctx context.Context, runID, stepID, scriptPath, userID, paperID, pipelineType string, client *sarvam.Client) error {
	log.Printf("[audio-gen][%s] starting: script_path=%s pipeline_type=%s", runID, scriptPath, pipelineType)

	data, err := downloadGCS(ctx, scriptPath)
	if err != nil {
		return fmt.Errorf("download script: %w", err)
	}
	log.Printf("[audio-gen][%s] script downloaded: %d bytes", runID, len(data))

	if pipelineType == "podcast" {
		return runPodcastAudioGen(ctx, runID, stepID, scriptPath, data, userID, paperID, client)
	}
	if pipelineType == "reel" {
		return runReelAudioGen(ctx, runID, stepID, scriptPath, data, userID, paperID, client)
	}

	var script Script
	if err := json.Unmarshal(data, &script); err != nil {
		return fmt.Errorf("parse script: %w", err)
	}
	log.Printf("[audio-gen][%s] parsed script: lang=%q gender=%q title_intro=%v sections=%d",
		runID, script.Language, script.VoiceGender, script.TitleIntro != "", len(script.Sections))

	lang := normalizeLang(script.Language)
	gender := script.VoiceGender
	if gender == "" {
		gender = "female"
	}

	type narrationSlide struct {
		index     int
		narration string
	}
	var slides []narrationSlide
	if script.TitleIntro != "" {
		slides = append(slides, narrationSlide{0, script.TitleIntro})
	}
	for i, sec := range script.Sections {
		if sec.Narration != "" {
			slides = append(slides, narrationSlide{i + 1, sec.Narration})
		}
	}
	log.Printf("[audio-gen][%s] slides to synthesize: %d (lang=%s gender=%s)", runID, len(slides), lang, gender)

	speaker, _ := voice.Next(ctx, rdb, gender)
	log.Printf("[audio-gen][%s] selected speaker=%q lang=%s provider=%s for %d slides",
		runID, speaker, lang, translationProvider, len(slides))

	sem := make(chan struct{}, maxConcurrent)
	type slideResult struct {
		index      int
		text       string
		audioPaths []string
		err        error
	}
	results := make([]slideResult, len(slides))
	var wg sync.WaitGroup

	for i, slide := range slides {
		wg.Add(1)
		go func(i int, s narrationSlide) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			log.Printf("[audio-gen][%s] slide=%d speaker=%q", runID, s.index, speaker)
			paths, err := synthesizeSlide(ctx, s.narration, lang, speaker,
				runID, userID, paperID, s.index, client)
			if err != nil {
				log.Printf("[audio-gen][%s] slide=%d FAILED: %v", runID, s.index, err)
			} else {
				log.Printf("[audio-gen][%s] slide=%d done: %d audio chunks uploaded", runID, s.index, len(paths))
			}
			results[i] = slideResult{s.index, s.narration, paths, err}
		}(i, slide)
	}
	wg.Wait()
	log.Printf("[audio-gen][%s] all goroutines finished", runID)

	var audioSlides []AudioSlide
	for _, r := range results {
		if r.err != nil {
			return fmt.Errorf("slide %d: %w", r.index, r.err)
		}
		audioSlides = append(audioSlides, AudioSlide{
			FrameIndex: r.index,
			Text:       r.text,
			AudioPaths: r.audioPaths,
		})
	}

	manifest := AudioManifest{RunID: runID, Slides: audioSlides}
	manifestBytes, _ := json.Marshal(manifest)
	runUUID, _ := uuid.Parse(runID)
	manifestKey := fmt.Sprintf("%s/%s/runs/%s/audio_gen/audio_manifest.json", userID, paperID, runUUID)

	log.Printf("[audio-gen][%s] uploading manifest to %s", runID, manifestKey)
	gcsPath, err := uploadGCS(ctx, manifestBytes, manifestKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload manifest: %w", err)
	}
	log.Printf("[audio-gen][%s] manifest uploaded: %s", runID, gcsPath)

	sendWebhook(runID, stepID, "completed", gcsPath, "", "audio_gen")
	log.Printf("[audio-gen][%s] completed, manifest=%s", runID, gcsPath)
	return nil
}

// ── Podcast pipeline ──────────────────────────────────────────────────────────

func validatePodcastScript(podcast PodcastScript) error {
	if strings.TrimSpace(podcast.Title) == "" {
		return fmt.Errorf("podcast title was empty")
	}
	if len(podcast.Turns) == 0 {
		return fmt.Errorf("podcast script contained no turns")
	}
	if len(podcast.Turns) < 10 {
		return fmt.Errorf("podcast script contained too few turns: %d", len(podcast.Turns))
	}

	emptyTextCount := 0
	for idx, turn := range podcast.Turns {
		if turn.Speaker != "host_a" && turn.Speaker != "host_b" {
			return fmt.Errorf("turn %d has invalid speaker %q", idx, turn.Speaker)
		}
		if strings.TrimSpace(turn.Text) == "" {
			emptyTextCount++
		}
	}
	if emptyTextCount > 0 {
		return fmt.Errorf("podcast script contained %d empty turn texts out of %d total", emptyTextCount, len(podcast.Turns))
	}
	return nil
}

func runPodcastAudioGen(ctx context.Context, runID, stepID, scriptPath string, scriptData []byte, userID, paperID string, client *sarvam.Client) error {
	log.Printf("[audio-gen-podcast][%s] starting", runID)

	var podcast PodcastScript
	if err := json.Unmarshal(scriptData, &podcast); err != nil {
		return fmt.Errorf("parse podcast script: %w", err)
	}
	log.Printf("[audio-gen-podcast][%s] parsed: title=%q language=%q turns=%d", runID, podcast.Title, podcast.Language, len(podcast.Turns))

	if err := validatePodcastScript(podcast); err != nil {
		log.Printf("[audio-gen-podcast][%s] CRITICAL: script-gen should have validated this: %v", runID, err)
		return fmt.Errorf("podcast script validation failed (this should have been caught in script-gen): %w", err)
	}

	if len(podcast.Turns) > 0 {
		log.Printf("[audio-gen-podcast][%s] first turn: speaker=%q text_len=%d", runID, podcast.Turns[0].Speaker, len(strings.TrimSpace(podcast.Turns[0].Text)))
	}

	lang := normalizeLang(podcast.Language)
	hostAVoice, hostBVoice, err := resolvePodcastVoices(ctx, scriptPath, &podcast)
	if err != nil {
		return err
	}

	log.Printf("[audio-gen-podcast][%s] routing: lang=%q provider=%s", runID, lang, translationProvider)

	sem := make(chan struct{}, maxConcurrent)
	type turnResult struct {
		index     int
		audioData []byte
		err       error
	}
	results := make([]turnResult, len(podcast.Turns))
	var wg sync.WaitGroup

	for i, turn := range podcast.Turns {
		wg.Add(1)
		go func(i int, t PodcastTurn) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			if strings.TrimSpace(t.Text) == "" {
				log.Printf("[audio-gen-podcast][%s] turn %d: empty text, skipping", runID, i)
				results[i] = turnResult{i, nil, nil}
				return
			}

			log.Printf("[audio-gen-podcast][%s] synthesizing turn %d/%d speaker=%q", runID, i+1, len(podcast.Turns), t.Speaker)

			speakerVoice := hostAVoice
			if normalizePodcastSpeaker(t.Speaker) == "host_b" {
				speakerVoice = hostBVoice
			}

			translated, tErr := translateText(t.Text, lang, containsDigits(t.Text), client)
			if tErr != nil {
				log.Printf("[audio-gen-podcast][%s] turn %d translate FAILED: %v", runID, i, tErr)
				results[i] = turnResult{i, nil, tErr}
				return
			}

			audioBytes, err := synthesizeTTS(translated, lang, speakerVoice, client)
			if err != nil {
				log.Printf("[audio-gen-podcast][%s] turn %d TTS FAILED: %v", runID, i, err)
			} else {
				log.Printf("[audio-gen-podcast][%s] turn %d synthesized: %d bytes", runID, i, len(audioBytes))
			}
			results[i] = turnResult{i, audioBytes, err}
		}(i, turn)
	}
	wg.Wait()
	log.Printf("[audio-gen-podcast][%s] all synthesization goroutines finished", runID)

	type wavFmt struct {
		sampleRate    uint32
		numChannels   uint16
		bitsPerSample uint16
	}
	var firstFmt *wavFmt
	var pcmSegments [][]byte
	for _, r := range results {
		if r.err != nil {
			return fmt.Errorf("turn %d: %w", r.index, r.err)
		}
		if len(r.audioData) == 0 {
			continue
		}
		sr, nc, bps, pcm, parseErr := wav.Parse(r.audioData)
		if parseErr != nil {
			log.Printf("[audio-gen-podcast][%s] turn %d: parseWAV error: %v — skipping segment", runID, r.index, parseErr)
			continue
		}
		if firstFmt == nil {
			firstFmt = &wavFmt{sr, nc, bps}
		}
		pcmSegments = append(pcmSegments, pcm)
	}

	if len(pcmSegments) == 0 {
		return fmt.Errorf("no audio segments generated")
	}

	sampleRate := wav.DefaultSampleRate
	numChannels := wav.DefaultNumChannels
	bitsPerSample := wav.DefaultBitsPerSample
	if firstFmt != nil {
		sampleRate = firstFmt.sampleRate
		numChannels = firstFmt.numChannels
		bitsPerSample = firstFmt.bitsPerSample
	}

	bytesPerSample := int(bitsPerSample / 8)
	silenceLen := int(sampleRate/2) * int(numChannels) * bytesPerSample
	silenceBytes := make([]byte, silenceLen)

	var combined []byte
	for i, seg := range pcmSegments {
		combined = append(combined, seg...)
		if i < len(pcmSegments)-1 {
			combined = append(combined, silenceBytes...)
		}
	}

	combined_wav := wav.Encode(combined, sampleRate, numChannels, bitsPerSample)

	runUUID, _ := uuid.Parse(runID)
	objectKey := fmt.Sprintf("%s/%s/runs/%s/podcast_tts/podcast.wav", userID, paperID, runUUID)
	gcsPath, err := uploadGCS(ctx, combined_wav, objectKey, "audio/wav")
	if err != nil {
		return fmt.Errorf("upload audio: %w", err)
	}

	log.Printf("[audio-gen-podcast][%s] podcast audio uploaded: %s size=%d bytes", runID, gcsPath, len(combined_wav))
	sendWebhook(runID, stepID, "completed", gcsPath, "", "podcast_tts")
	return nil
}

func resolvePodcastVoices(ctx context.Context, scriptPath string, podcast *PodcastScript) (string, string, error) {
	hostAGender := normalizePodcastGender(podcast.Speakers.HostA.Gender, "female")
	hostBGender := normalizePodcastGender(podcast.Speakers.HostB.Gender, "male")

	hostAVoice := strings.TrimSpace(podcast.Speakers.HostA.Voice)
	if hostAVoice == "" {
		voiceName, err := voice.Next(ctx, rdb, hostAGender)
		if err != nil {
			log.Printf("[audio-gen-podcast][%s] voice.Next(hostA, %q) failed: %v, using fallback", podcast.RunID, hostAGender, err)
			voiceName = "ishita"
			if hostAGender == "male" {
				voiceName = "aditya"
			}
		}
		hostAVoice = voiceName
	}

	hostBVoice := strings.TrimSpace(podcast.Speakers.HostB.Voice)
	if hostBVoice == "" {
		voiceName, err := voice.Next(ctx, rdb, hostBGender)
		if err != nil {
			log.Printf("[audio-gen-podcast][%s] voice.Next(hostB, %q) failed: %v, using fallback", podcast.RunID, hostBGender, err)
			voiceName = "aditya"
			if hostBGender == "female" {
				voiceName = "ishita"
			}
		}
		hostBVoice = voiceName
	}
	if hostBVoice == hostAVoice {
		hostBVoice = voice.DifferentFrom(hostBGender, hostAVoice)
	}

	if hostAVoice == "" {
		return "", "", fmt.Errorf("hostA voice resolved to empty string (gender=%q)", hostAGender)
	}
	if hostBVoice == "" {
		return "", "", fmt.Errorf("hostB voice resolved to empty string (gender=%q)", hostBGender)
	}

	log.Printf("[audio-gen-podcast][%s] voices resolved: hostA=%q (%s) hostB=%q (%s)", podcast.RunID, hostAVoice, hostAGender, hostBVoice, hostBGender)

	podcast.Speakers.HostA.Gender = hostAGender
	podcast.Speakers.HostA.Voice = hostAVoice
	podcast.Speakers.HostB.Gender = hostBGender
	podcast.Speakers.HostB.Voice = hostBVoice

	updated, err := json.Marshal(podcast)
	if err == nil {
		if _, uploadErr := uploadGCS(ctx, updated, extractKey(scriptPath), "application/json"); uploadErr != nil {
			log.Printf("[audio-gen-podcast][%s] warning: failed to persist selected voices: %v", podcast.RunID, uploadErr)
		}
	}

	return hostAVoice, hostBVoice, nil
}

// ── Reel pipeline ─────────────────────────────────────────────────────────────

func runReelAudioGen(ctx context.Context, runID, stepID, scriptPath string, scriptData []byte, userID, paperID string, client *sarvam.Client) error {
	log.Printf("[audio-gen-reel][%s] starting", runID)

	var reel ReelScript
	if err := json.Unmarshal(scriptData, &reel); err != nil {
		return fmt.Errorf("parse reel script: %w", err)
	}
	if reel.Avatars == nil || strings.TrimSpace(reel.Avatars.Pair) == "" {
		return fmt.Errorf("reel script missing avatar selection — call POST /avatars before /finalize")
	}
	if len(reel.Turns) == 0 {
		return fmt.Errorf("reel script has no turns")
	}
	log.Printf("[audio-gen-reel][%s] parsed: title=%q lang=%q turns=%d pair=%s",
		runID, reel.Title, reel.Language, len(reel.Turns), reel.Avatars.Pair)

	lang := normalizeLang(reel.Language)

	person1Voice, err := voice.Next(ctx, rdb, "female")
	if err != nil || person1Voice == "" {
		person1Voice = "ishita"
	}
	person2Voice, err := voice.Next(ctx, rdb, "male")
	if err != nil || person2Voice == "" {
		person2Voice = "aditya"
	}
	log.Printf("[audio-gen-reel][%s] voices: Person1=%s Person2=%s", runID, person1Voice, person2Voice)

	runUUID, _ := uuid.Parse(runID)

	log.Printf("[audio-gen-reel][%s] routing: lang=%q provider=%s Person1=%s Person2=%s",
		runID, lang, translationProvider, person1Voice, person2Voice)

	sem := make(chan struct{}, maxConcurrent)
	type turnResult struct {
		index int
		entry ReelTurnManifest
		err   error
	}
	results := make([]turnResult, len(reel.Turns))
	var wg sync.WaitGroup

	for i, turn := range reel.Turns {
		wg.Add(1)
		go func(i int, t ReelTurn) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			text := strings.TrimSpace(t.Text)
			if text == "" {
				results[i] = turnResult{i, ReelTurnManifest{}, fmt.Errorf("turn %d: empty text", i)}
				return
			}
			speakerVoice := person1Voice
			if t.Speaker == "Person2" {
				speakerVoice = person2Voice
			}

			translated, tErr := translateText(text, lang, containsDigits(text), client)
			if tErr != nil {
				results[i] = turnResult{i, ReelTurnManifest{}, fmt.Errorf("turn %d translate: %w", i, tErr)}
				return
			}
			audioBytes, ttsErr := synthesizeTTS(translated, lang, speakerVoice, client)
			if ttsErr != nil {
				results[i] = turnResult{i, ReelTurnManifest{}, fmt.Errorf("turn %d TTS: %w", i, ttsErr)}
				return
			}

			objKey := fmt.Sprintf("%s/%s/runs/%s/reel_audio_gen/%02d_%s.wav",
				userID, paperID, runUUID, i, t.Speaker)
			gcsPath, upErr := uploadGCS(ctx, audioBytes, objKey, "audio/wav")
			if upErr != nil {
				results[i] = turnResult{i, ReelTurnManifest{}, fmt.Errorf("turn %d upload: %w", i, upErr)}
				return
			}
			results[i] = turnResult{
				index: i,
				entry: ReelTurnManifest{
					Index:        i,
					Speaker:      t.Speaker,
					Voice:        speakerVoice,
					AudioGCSPath: gcsPath,
					WordCount:    len(strings.Fields(text)),
					Text:         text,
				},
			}
		}(i, turn)
	}
	wg.Wait()

	turns := make([]ReelTurnManifest, 0, len(results))
	for _, r := range results {
		if r.err != nil {
			return r.err
		}
		turns = append(turns, r.entry)
	}

	manifest := ReelAudioManifest{
		RunID:    runID,
		Title:    reel.Title,
		Language: lang,
		Avatars:  reel.Avatars,
		Turns:    turns,
	}
	manifest.Voices.Person1 = person1Voice
	manifest.Voices.Person2 = person2Voice

	manifestBytes, _ := json.Marshal(manifest)
	manifestKey := fmt.Sprintf("%s/%s/runs/%s/reel_audio_gen/manifest.json", userID, paperID, runUUID)
	gcsPath, err := uploadGCS(ctx, manifestBytes, manifestKey, "application/json")
	if err != nil {
		return fmt.Errorf("upload reel manifest: %w", err)
	}

	log.Printf("[audio-gen-reel][%s] manifest uploaded: %s turns=%d", runID, gcsPath, len(turns))
	sendWebhook(runID, stepID, "completed", gcsPath, "", "reel_audio_gen")
	return nil
}
