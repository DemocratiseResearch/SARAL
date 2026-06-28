package apiresp

import (
	"regexp"
)

var sensitiveRE = regexp.MustCompile(`(?i)(token|code|state|api_key|api[_-]?key|secret|password)=[^&]+`)

// SanitizeURL strips sensitive query parameters from a URL for safe logging.
// Replaces the value of known sensitive params with "[REDACTED]" so auth tokens,
// OAuth codes, and API keys never appear in server logs.
func SanitizeURL(uri string) string {
	return sensitiveRE.ReplaceAllString(uri, "$1=[REDACTED]")
}
