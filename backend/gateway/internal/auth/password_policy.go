package auth


import (
	_ "embed"
	"strings"
	"sync"
	"unicode"
)

// common_passwords.txt is the SecLists 10k-most-common list, embedded at
// compile time. To update: replace the file and rebuild.
//
//go:embed common_passwords.txt
var commonPasswordsRaw string

// commonPasswords is the parsed lookup set, built once on first use.
var (
	commonPasswords     map[string]struct{}
	commonPasswordsOnce sync.Once
)

func loadCommonPasswords() map[string]struct{} {
	commonPasswordsOnce.Do(func() {
		lines := strings.Split(commonPasswordsRaw, "\n")
		m := make(map[string]struct{}, len(lines))
		for _, line := range lines {
			pw := strings.TrimSpace(strings.ToLower(line))
			if pw != "" {
				m[pw] = struct{}{}
			}
		}
		commonPasswords = m
	})
	return commonPasswords
}

// PasswordViolation carries a machine-readable code and a human message.

type PasswordViolation struct {
	Code    string
	Message string
}

func (v PasswordViolation) Error() string { return v.Message }

// validatePassword checks all rules and returns the first violated rule, or
func validatePassword(password, emailAddress string) *PasswordViolation {
	// ── Rule 1: length ───────────────────────────────────────────────────────
	if len(password) < 8 {
		return &PasswordViolation{
			Code:    "password_too_short",
			Message: "password must be at least 8 characters",
		}
	}
	if len(password) > 128 {
		return &PasswordViolation{
			Code:    "password_too_long",
			Message: "password must be 128 characters or fewer",
		}
	}

	// ── Rule 2: common password blocklist ────────────────────────────────────
	if _, blocked := loadCommonPasswords()[strings.ToLower(password)]; blocked {
		return &PasswordViolation{
			Code:    "password_too_common",
			Message: "that password is too common — choose something more unique",
		}
	}

	// ── Rule 3: password must not contain the email local-part ───────────────
	if emailAddress != "" {
		localPart := emailAddress
		if idx := strings.Index(emailAddress, "@"); idx > 0 {
			localPart = emailAddress[:idx]
		}
		if len(localPart) >= 4 &&
			strings.Contains(strings.ToLower(password), strings.ToLower(localPart)) {
			return &PasswordViolation{
				Code:    "password_contains_email",
				Message: "password must not contain your email address",
			}
		}
	}

	// ── Rule 4: no run of 4+ identical characters ────────────────────────────
	runes := []rune(password)
	for i := 3; i < len(runes); i++ {
		if runes[i] == runes[i-1] && runes[i] == runes[i-2] && runes[i] == runes[i-3] {
			return &PasswordViolation{
				Code:    "password_repeated_chars",
				Message: "password must not contain 4 or more identical characters in a row",
			}
		}
	}

	// ── Rule 5: must have at least one letter and one non-letter ─────────────
	hasLetter := false
	hasNonLetter := false
	for _, r := range password {
		if unicode.IsLetter(r) {
			hasLetter = true
		} else {
			hasNonLetter = true
		}
		if hasLetter && hasNonLetter {
			break
		}
	}
	if !hasLetter {
		return &PasswordViolation{
			Code:    "password_no_letter",
			Message: "password must contain at least one letter",
		}
	}
	if !hasNonLetter {
		return &PasswordViolation{
			Code:    "password_no_digit_or_symbol",
			Message: "password must contain at least one digit or symbol",
		}
	}

	return nil
}
