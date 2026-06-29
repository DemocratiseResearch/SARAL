package social

import (
	"bytes"
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


const linkedinAPIVersion = "202604"

// LinkedInClient handles OAuth2 and native-video publishing for LinkedIn.
type LinkedInClient struct {
	clientID     string
	clientSecret string
	redirectURI  string
	httpClient   *http.Client
}

func NewLinkedInClient() *LinkedInClient {
	return &LinkedInClient{
		clientID:     os.Getenv("LINKEDIN_CLIENT_ID"),
		clientSecret: os.Getenv("LINKEDIN_CLIENT_SECRET"),
		redirectURI:  os.Getenv("LINKEDIN_REDIRECT_URI"),
		httpClient: &http.Client{
			Timeout: 10 * time.Minute,
		},
	}
}


func (c *LinkedInClient) BuildAuthURL(state string) string {
	params := url.Values{
		"response_type": {"code"},
		"client_id":     {c.clientID},
		"redirect_uri":  {c.redirectURI},
		"state":         {state},
		"scope":         {"openid profile email w_member_social"},
	}
	return "https://www.linkedin.com/oauth/v2/authorization?" + params.Encode()
}


func (c *LinkedInClient) ExchangeCode(ctx context.Context, code string) (*models.OAuthTokens, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
		"redirect_uri":  {c.redirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://www.linkedin.com/oauth/v2/accessToken", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("linkedin: create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("linkedin: token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("linkedin: token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		ExpiresIn    int    `json:"expires_in"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("linkedin: decode token response: %w", err)
	}

	return &models.OAuthTokens{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		Expiry:       time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
	}, nil
}


func (c *LinkedInClient) RefreshAccessToken(ctx context.Context, refreshToken string) (*models.OAuthTokens, error) {
	data := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://www.linkedin.com/oauth/v2/accessToken", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("linkedin: create refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("linkedin: refresh request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("linkedin: token refresh failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		ExpiresIn    int    `json:"expires_in"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("linkedin: decode refresh response: %w", err)
	}

	// LinkedIn may rotate the refresh token; prefer the new one if present.
	newRefresh := tokenResp.RefreshToken
	if newRefresh == "" {
		newRefresh = refreshToken
	}

	return &models.OAuthTokens{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: newRefresh,
		Expiry:       time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
	}, nil
}


func (c *LinkedInClient) FetchPersonURN(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.linkedin.com/v2/userinfo", nil)
	if err != nil {
		return "", fmt.Errorf("linkedin: create userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("linkedin: userinfo request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("linkedin: userinfo failed (%d): %s", resp.StatusCode, string(body))
	}

	var u struct {
		Sub string `json:"sub"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", fmt.Errorf("linkedin: decode userinfo: %w", err)
	}
	if u.Sub == "" {
		return "", fmt.Errorf("linkedin: userinfo returned empty sub")
	}
	return "urn:li:person:" + u.Sub, nil
}


func (c *LinkedInClient) UploadVideo(ctx context.Context, accessToken, personURN string, videoReader io.Reader, videoSize int64, metadata models.ShareRequest) (*models.ShareResponse, error) {
	videoBytes, err := io.ReadAll(videoReader)
	if err != nil {
		return nil, fmt.Errorf("linkedin: read video: %w", err)
	}
	if int64(len(videoBytes)) != videoSize {
		return nil, fmt.Errorf("linkedin: video size mismatch (got %d, expected %d)", len(videoBytes), videoSize)
	}

	// Step 1 — initializeUpload
	videoURN, uploadInstructions, uploadToken, err := c.initializeUpload(ctx, accessToken, personURN, videoSize)
	if err != nil {
		return nil, err
	}

	// Step 2 — PUT each part, collect ETags
	partIDs, err := c.uploadParts(ctx, uploadInstructions, videoBytes)
	if err != nil {
		return nil, err
	}

	// Step 3 — finalizeUpload
	if err := c.finalizeUpload(ctx, accessToken, videoURN, uploadToken, partIDs); err != nil {
		return nil, err
	}

	// Step 4 — create the post
	postURN, err := c.createPost(ctx, accessToken, personURN, videoURN, metadata)
	if err != nil {
		return nil, err
	}

	return &models.ShareResponse{
		Platform: "linkedin",
		ID:       postURN,
		URL:      "https://www.linkedin.com/feed/update/" + url.PathEscape(postURN) + "/",
	}, nil
}



func (c *LinkedInClient) initializeUpload(ctx context.Context, accessToken, personURN string, size int64) (videoURN string, instructions []linkedinUploadInstruction, uploadToken string, err error) {
	body, _ := json.Marshal(map[string]any{
		"initializeUploadRequest": map[string]any{
			"owner":           personURN,
			"fileSizeBytes":   size,
			"uploadCaptions":  false,
			"uploadThumbnail": false,
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.linkedin.com/rest/videos?action=initializeUpload", bytes.NewReader(body))
	if err != nil {
		return "", nil, "", fmt.Errorf("linkedin: create init request: %w", err)
	}
	c.setRESTHeaders(req, accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", nil, "", fmt.Errorf("linkedin: init upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", nil, "", fmt.Errorf("linkedin: init upload failed (%d): %s", resp.StatusCode, string(b))
	}

	var initResp struct {
		Value struct {
			Video              string                      `json:"video"`
			UploadToken        string                      `json:"uploadToken"`
			UploadInstructions []linkedinUploadInstruction `json:"uploadInstructions"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&initResp); err != nil {
		return "", nil, "", fmt.Errorf("linkedin: decode init response: %w", err)
	}
	if initResp.Value.Video == "" || len(initResp.Value.UploadInstructions) == 0 {
		return "", nil, "", fmt.Errorf("linkedin: init response missing video URN or instructions")
	}
	return initResp.Value.Video, initResp.Value.UploadInstructions, initResp.Value.UploadToken, nil
}

func (c *LinkedInClient) uploadParts(ctx context.Context, instructions []linkedinUploadInstruction, videoBytes []byte) ([]string, error) {
	partIDs := make([]string, 0, len(instructions))
	for i, inst := range instructions {
		if inst.FirstByte < 0 || inst.LastByte >= int64(len(videoBytes)) || inst.FirstByte > inst.LastByte {
			return nil, fmt.Errorf("linkedin: part %d has invalid byte range [%d..%d] for %d-byte video",
				i, inst.FirstByte, inst.LastByte, len(videoBytes))
		}
		chunk := videoBytes[inst.FirstByte : inst.LastByte+1]

		req, err := http.NewRequestWithContext(ctx, http.MethodPut, inst.UploadURL, bytes.NewReader(chunk))
		if err != nil {
			return nil, fmt.Errorf("linkedin: create part %d request: %w", i, err)
		}
		req.ContentLength = int64(len(chunk))

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("linkedin: upload part %d: %w", i, err)
		}
		etag := resp.Header.Get("ETag")
		resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("linkedin: upload part %d failed (%d)", i, resp.StatusCode)
		}
		if etag == "" {
			return nil, fmt.Errorf("linkedin: upload part %d returned no ETag", i)
		}
		partIDs = append(partIDs, strings.Trim(etag, `"`))
	}
	return partIDs, nil
}

func (c *LinkedInClient) finalizeUpload(ctx context.Context, accessToken, videoURN, uploadToken string, partIDs []string) error {
	body, _ := json.Marshal(map[string]any{
		"finalizeUploadRequest": map[string]any{
			"video":           videoURN,
			"uploadToken":     uploadToken,
			"uploadedPartIds": partIDs,
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.linkedin.com/rest/videos?action=finalizeUpload", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("linkedin: create finalize request: %w", err)
	}
	c.setRESTHeaders(req, accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("linkedin: finalize upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("linkedin: finalize failed (%d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *LinkedInClient) createPost(ctx context.Context, accessToken, personURN, videoURN string, metadata models.ShareRequest) (string, error) {
	commentary := metadata.Description
	if commentary == "" {
		commentary = metadata.Title
	}
	commentary = escapeLinkedInText(commentary)

	body, _ := json.Marshal(map[string]any{
		"author":     personURN,
		"commentary": commentary,
		"visibility": mapLinkedInVisibility(metadata.Visibility),
		"distribution": map[string]any{
			"feedDistribution":               "MAIN_FEED",
			"targetEntities":                 []any{},
			"thirdPartyDistributionChannels": []any{},
		},
		"content": map[string]any{
			"media": map[string]any{
				"title": metadata.Title,
				"id":    videoURN,
			},
		},
		"lifecycleState":            "PUBLISHED",
		"isReshareDisabledByAuthor": false,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.linkedin.com/rest/posts", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("linkedin: create post request: %w", err)
	}
	c.setRESTHeaders(req, accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("linkedin: create post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("linkedin: create post failed (%d): %s", resp.StatusCode, string(b))
	}

	// LinkedIn returns the post URN in the x-restli-id header (reliable),
	// and also in a JSON body on some paths. Prefer the header.
	if urn := resp.Header.Get("x-restli-id"); urn != "" {
		return urn, nil
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err == nil && out.ID != "" {
		return out.ID, nil
	}
	return "", fmt.Errorf("linkedin: post URN not returned")
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type linkedinUploadInstruction struct {
	UploadURL string `json:"uploadUrl"`
	FirstByte int64  `json:"firstByte"`
	LastByte  int64  `json:"lastByte"`
}

func (c *LinkedInClient) setRESTHeaders(req *http.Request, accessToken string) {
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("LinkedIn-Version", linkedinAPIVersion)
	req.Header.Set("X-Restli-Protocol-Version", "2.0.0")
	req.Header.Set("Content-Type", "application/json")
}


func mapLinkedInVisibility(v string) string {
	switch strings.ToLower(v) {
	case "private":
		return "CONNECTIONS"
	case "public", "unlisted", "":
		return "PUBLIC"
	default:
		return "PUBLIC"
	}
}


func escapeLinkedInText(s string) string {
	reserved := `\|{}@[]()<>#*_~`
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if strings.ContainsRune(reserved, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}
