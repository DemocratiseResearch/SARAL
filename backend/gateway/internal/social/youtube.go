
package social

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/saral/gateway/internal/models"
)

// YouTubeClient handles OAuth2 and video uploads for YouTube.
type YouTubeClient struct {
	clientID     string
	clientSecret string
	redirectURI  string
	httpClient   *http.Client
}

func NewYouTubeClient() *YouTubeClient {
	return &YouTubeClient{
		clientID:     os.Getenv("YOUTUBE_CLIENT_ID"),
		clientSecret: os.Getenv("YOUTUBE_CLIENT_SECRET"),
		redirectURI:  os.Getenv("YOUTUBE_REDIRECT_URI"),
		httpClient: &http.Client{
			Timeout: 10 * time.Minute, // video uploads can be slow
		},
	}
}

// BuildAuthURL returns the Google OAuth2 consent URL.
func (c *YouTubeClient) BuildAuthURL(state string) string {
	params := url.Values{
		"client_id":     {c.clientID},
		"redirect_uri":  {c.redirectURI},
		"response_type": {"code"},
		"scope":         {"https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"},
		"access_type":   {"offline"}, // needed to get refresh_token
		"prompt":        {"consent"}, // force consent to always get refresh_token
		"state":         {state},
	}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
}

// ExchangeCode exchanges an authorization code for access + refresh tokens.
func (c *YouTubeClient) ExchangeCode(ctx context.Context, code string) (*models.OAuthTokens, error) {
	data := url.Values{
		"code":          {code},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
		"redirect_uri":  {c.redirectURI},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/token", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("youtube: create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("youtube: token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("youtube: token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("youtube: decode token response: %w", err)
	}

	return &models.OAuthTokens{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		Expiry:       time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
	}, nil
}

// RefreshAccessToken uses the refresh token to get a new access token.
func (c *YouTubeClient) RefreshAccessToken(ctx context.Context, refreshToken string) (*models.OAuthTokens, error) {
	data := url.Values{
		"refresh_token": {refreshToken},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
		"grant_type":    {"refresh_token"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/token", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("youtube: create refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("youtube: refresh request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("youtube: token refresh failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("youtube: decode refresh response: %w", err)
	}

	return &models.OAuthTokens{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: refreshToken, // refresh token stays the same
		Expiry:       time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
	}, nil
}


func (c *YouTubeClient) UploadVideo(ctx context.Context, accessToken string, videoReader io.Reader, videoSize int64, metadata models.ShareRequest) (*models.ShareResponse, error) {
	// Map visibility to YouTube's privacy status
	privacyStatus := "unlisted" // safe default
	switch strings.ToLower(metadata.Visibility) {
	case "public":
		privacyStatus = "public"
	case "private":
		privacyStatus = "private"
	case "unlisted", "":
		privacyStatus = "unlisted"
	}

	// Step 1: Init resumable upload session
	snippetJSON, _ := json.Marshal(map[string]any{
		"snippet": map[string]any{
			"title":       metadata.Title,
			"description": metadata.Description,
			"categoryId":  "27", // Education
		},
		"status": map[string]any{
			"privacyStatus": privacyStatus,
		},
	})

	initReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
		strings.NewReader(string(snippetJSON)))
	if err != nil {
		return nil, fmt.Errorf("youtube: create init request: %w", err)
	}
	initReq.Header.Set("Authorization", "Bearer "+accessToken)
	initReq.Header.Set("Content-Type", "application/json; charset=UTF-8")
	initReq.Header.Set("X-Upload-Content-Type", "video/mp4")
	initReq.Header.Set("X-Upload-Content-Length", fmt.Sprintf("%d", videoSize))

	initResp, err := c.httpClient.Do(initReq)
	if err != nil {
		return nil, fmt.Errorf("youtube: init upload: %w", err)
	}
	defer initResp.Body.Close()

	if initResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(initResp.Body)
		return nil, fmt.Errorf("youtube: init upload failed (%d): %s", initResp.StatusCode, string(body))
	}

	uploadURL := initResp.Header.Get("Location")
	if uploadURL == "" {
		return nil, fmt.Errorf("youtube: no upload URL in init response")
	}

	// Step 2: Upload the video bytes to the session URI
	uploadReq, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, videoReader)
	if err != nil {
		return nil, fmt.Errorf("youtube: create upload request: %w", err)
	}
	uploadReq.Header.Set("Content-Type", "video/mp4")
	uploadReq.ContentLength = videoSize

	uploadResp, err := c.httpClient.Do(uploadReq)
	if err != nil {
		return nil, fmt.Errorf("youtube: upload video: %w", err)
	}
	defer uploadResp.Body.Close()

	if uploadResp.StatusCode < 200 || uploadResp.StatusCode >= 300 {
		body, _ := io.ReadAll(uploadResp.Body)
		return nil, fmt.Errorf("youtube: upload failed (%d): %s", uploadResp.StatusCode, string(body))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(uploadResp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("youtube: decode upload response: %w", err)
	}

	return &models.ShareResponse{
		Platform: "youtube",
		ID:       result.ID,
		URL:      "https://www.youtube.com/watch?v=" + result.ID,
	}, nil
}
