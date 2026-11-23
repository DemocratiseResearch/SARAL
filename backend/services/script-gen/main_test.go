package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"

	"github.com/saral/script-gen/internal/config"
	"github.com/saral/script-gen/internal/gemini"
	"github.com/saral/script-gen/internal/pipeline"
)

type draftTestStore struct {
	extracted []byte
	thread    []byte
}

func (s *draftTestStore) Download(_ context.Context, _ string) ([]byte, error) {
	return s.extracted, nil
}

func (s *draftTestStore) Upload(_ context.Context, thread []byte, key, contentType string) (string, error) {
	if !strings.HasSuffix(key, "/twitter_draft/thread.json") || contentType != "application/json" {
		return "", fmt.Errorf("unexpected draft artifact")
	}
	s.thread = thread
	return "gs://test-bucket/" + key, nil
}

type draftTestTransport func(*http.Request) (*http.Response, error)

func (f draftTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestOpenAIXDraftConfiguration(t *testing.T) {
	if provider, err := gemini.NewOpenAIXDraftProvider("test-key", ""); provider != nil || err != nil {
		t.Fatal("a key without an X-draft model should keep direct OpenAI disabled")
	}
	if _, err := gemini.NewOpenAIXDraftProvider(" ", "test-model"); err == nil {
		t.Fatal("expected an error for a missing OpenAI key when enabled")
	}
}

func TestOpenAIXDraft(t *testing.T) {
	const gateway = "http://127.0.0.1:19087"
	const responsesURL = "https://api.openai.com/v1/responses"
	textPath := os.Getenv("SARAL_OPENAI_SMOKE_TEXT")
	live := textPath != ""
	paperText := "A test paper about sequence transduction using attention."
	if live {
		_ = godotenv.Load("../../.env.shared")
		text, err := os.ReadFile(textPath)
		if err != nil {
			t.Fatal(err)
		}
		paperText = string(text)
		if strings.TrimSpace(paperText) == "" {
			t.Fatal("the smoke-test paper text is empty")
		}
	} else {
		t.Setenv("OPENAI_API_KEY", "synthetic-openai-key")
		t.Setenv("X_DRAFT_OPENAI_MODEL", "test-model")
	}

	key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	model := strings.TrimSpace(os.Getenv("X_DRAFT_OPENAI_MODEL"))
	provider, err := gemini.NewOpenAIXDraftProvider(key, model)
	if err != nil {
		t.Fatal(err)
	}
	if provider == nil {
		t.Fatal("set X_DRAFT_OPENAI_MODEL to enable the live test")
	}
	prompts, err := config.Load("prompts/prompts.json")
	if err != nil {
		t.Fatal(err)
	}
	extracted, err := json.Marshal(pipeline.ExtractedDocument{Text: paperText})
	if err != nil {
		t.Fatal(err)
	}

	base := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = base })
	requests := 0
	completed := false
	http.DefaultTransport = draftTestTransport(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() == gateway+"/webhooks/worker/twitter_draft" && req.Method == http.MethodPost {
			defer req.Body.Close()
			var event struct{ Status string }
			if err := json.NewDecoder(req.Body).Decode(&event); err != nil {
				return nil, err
			}
			completed = event.Status == "completed"
			return &http.Response{StatusCode: http.StatusNoContent, Body: http.NoBody}, nil
		}
		if req.URL.String() != responsesURL || req.Method != http.MethodPost {
			return nil, fmt.Errorf("unexpected request destination")
		}
		if req.Header.Get("Authorization") != "Bearer "+key {
			return nil, fmt.Errorf("the Responses API request did not use OPENAI_API_KEY")
		}
		requests++
		if live {
			return base.RoundTrip(req)
		}
		defer req.Body.Close()
		var payload struct {
			Model string
			Input string
			Store *bool
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			return nil, err
		}
		if payload.Model != model || !strings.Contains(payload.Input, paperText) || payload.Store == nil || *payload.Store {
			return nil, fmt.Errorf("unexpected Responses API payload")
		}
		output := `{"title":"Attention Test","authors":"Test Author","date":"2017"}`
		if requests == 2 {
			output = `{"tweets":["A first post.","A second post."]}`
		}
		response := fmt.Sprintf(`{"status":"completed","output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":%q}]}]}`, output)
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(response))}, nil
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	store := &draftTestStore{extracted: extracted}
	worker := &app{openAIXDraft: provider}
	fields := map[string]string{
		"run_id":             "3f8089dd-45ba-46bc-b369-91f093a73de5",
		"step_id":            "test-step",
		"extracted_gcs_path": "extracted.json",
		"user_id":            "test-user",
		"paper_id":           "test-paper",
	}
	err = worker.runPipeline(ctx, "twitter_draft", "", "", func(field string) string {
		if field == "gemini_key" {
			t.Fatal("the direct OpenAI path should not read the job's Gemini credential")
		}
		return fields[field]
	}, pipeline.Deps{Store: store, Prompts: prompts, GatewayURL: gateway})
	if err != nil {
		t.Fatal(err)
	}
	var draft struct {
		Title      string
		Tweets     []string
		TweetCount int `json:"tweet_count"`
	}
	if err := json.Unmarshal(store.thread, &draft); err != nil {
		t.Fatal(err)
	}
	if requests != 2 || !completed || len(draft.Tweets) < 2 || draft.TweetCount != len(draft.Tweets) {
		t.Fatalf("unexpected draft result: requests=%d completed=%t posts=%d", requests, completed, len(draft.Tweets))
	}
	if live {
		if draft.Title == "" || draft.Title == "Untitled Research" {
			t.Fatal("the live run did not extract the paper title")
		}
		t.Logf("Generated %d posts for %q using two direct OpenAI requests.\n\n%s",
			draft.TweetCount, draft.Title, strings.Join(draft.Tweets, "\n\n"))
	} else if draft.Title != "Attention Test" || len(draft.Tweets) != 2 {
		t.Fatalf("unexpected mocked draft: title=%q posts=%d", draft.Title, len(draft.Tweets))
	}
}
