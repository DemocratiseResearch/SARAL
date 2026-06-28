package models

import "time"

// OAuthTokens holds stored OAuth credentials for a provider.
type OAuthTokens struct {
	AccessToken  string
	RefreshToken string
	Expiry       time.Time
}

// Expired returns true if the token is expired or will expire within 5 minutes.
func (t OAuthTokens) Expired() bool {
	return t.AccessToken == "" || time.Now().Add(5*time.Minute).After(t.Expiry)
}

// ShareRequest is the JSON body for share endpoints.
type ShareRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"` // public, unlisted, private
}

// ShareResponse is returned after a successful share.
type ShareResponse struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
	ID       string `json:"id"`
}
