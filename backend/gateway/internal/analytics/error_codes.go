

package analytics

import "strings"


const (
	ErrMissingAPIKey = "MISSING_API_KEY"
	ErrPDFTooSmall   = "PDF_TOO_SMALL"
	ErrJobNotFound   = "JOB_NOT_FOUND"
	ErrNoScript      = "NO_SCRIPT"
	ErrInternal      = "INTERNAL_ERROR"
)

// ClassifyError returns a short error-code string for the given error message.
func ClassifyError(msg string) string {
	lower := strings.ToLower(msg)

	// ── Sarvam ────────────────────────────────────────────────────────────────
	if strings.Contains(lower, "sarvam") {
		switch {
		case anyOf(lower, "429", "rate limit", "ratelimit", "too many requests", "quota"):
			return "SARVAM_RATE_LIMITED"
		case anyOf(lower, "503", "unavailable", "overloaded", "network error", "connection"):
			return "SARVAM_UNAVAILABLE"
		case anyOf(lower, "401", "unauthorized", "api key", "apikey", "invalid key"):
			return "AUTH_FAILED"
		default:
			return "SARVAM_ERROR"
		}
	}

	// ── Bhashini ─────────────────────────────────────────────────────────────
	if anyOf(lower, "bhashini", "mt_bhashini") {
		switch {
		case anyOf(lower, "429", "rate limit", "ratelimit", "too many requests", "quota"):
			return "BHASHINI_RATE_LIMITED"
		case anyOf(lower, "503", "unavailable", "overloaded", "network error", "connection"):
			return "BHASHINI_UNAVAILABLE"
		case anyOf(lower, "401", "unauthorized", "api key", "apikey", "invalid key"):
			return "AUTH_FAILED"
		default:
			return "BHASHINI_ERROR"
		}
	}

	// ── Gemini / generic AI quota ─────────────────────────────────────────────
	if anyOf(lower, "429", "resource_exhausted", "quota", "rate limit", "ratelimit", "too many requests") {
		return "GEMINI_QUOTA_EXCEEDED"
	}
	if anyOf(lower, "503", "unavailable", "overloaded") {
		return "GEMINI_UNAVAILABLE"
	}

	// ── Auth / config ─────────────────────────────────────────────────────────
	if anyOf(lower, "401", "unauthorized", "invalid api key", "invalid_api_key", "api key not valid") {
		return "AUTH_FAILED"
	}
	if anyOf(lower, "not configured", "not set", "missing", "no api key") {
		return "MISSING_API_KEY"
	}

	return ErrInternal
}

// anyOf returns true if s contains any of the provided substrings.
func anyOf(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
