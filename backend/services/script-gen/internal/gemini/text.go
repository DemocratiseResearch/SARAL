package gemini

import (
	"fmt"
	"strings"
)

// StripCodeFences removes markdown code fences (``` or ```json) from Gemini
// responses that ignore the "return raw JSON" instruction.
func StripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = s[3:]
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		}
		s = strings.TrimSpace(s)
	}
	if strings.HasSuffix(s, "```") {
		s = s[:len(s)-3]
		s = strings.TrimSpace(s)
	}
	s = strings.Trim(s, "`")
	return strings.TrimSpace(s)
}

// FixJSONBackslashes repairs invalid escape sequences that Gemini occasionally
// produces (e.g. "\p" inside a JSON string), which would cause json.Unmarshal
// to fail. Valid sequences (\", \\, \/, \uXXXX, \b, \f, \n, \r, \t) are left
// untouched; everything else is double-escaped so the JSON decoder sees a
// literal backslash.
func FixJSONBackslashes(raw string) string {
	var b strings.Builder
	b.Grow(len(raw))
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' || i+1 >= len(raw) {
			b.WriteByte(raw[i])
			continue
		}
		nxt := raw[i+1]
		// Always-valid JSON escapes
		if nxt == '"' || nxt == '\\' || nxt == '/' {
			b.WriteByte(raw[i])
			b.WriteByte(nxt)
			i++
			continue
		}
		// Unicode escape \uXXXX
		if nxt == 'u' && i+5 < len(raw) {
			hex := raw[i+2 : i+6]
			valid := true
			for _, c := range hex {
				if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
					valid = false
					break
				}
			}
			if valid {
				b.WriteString(raw[i : i+6])
				i += 5
				continue
			}
		}
		// Single-char escapes that are only valid when NOT followed by a letter
		// (e.g. \n is valid but \name is not — the model sometimes writes "\n" mid-word)
		if nxt == 'b' || nxt == 'f' || nxt == 'n' || nxt == 'r' || nxt == 't' {
			isLetter := i+2 < len(raw) && ((raw[i+2] >= 'a' && raw[i+2] <= 'z') || (raw[i+2] >= 'A' && raw[i+2] <= 'Z'))
			if isLetter {
				b.WriteString("\\\\")
				continue
			}
			b.WriteByte(raw[i])
			b.WriteByte(nxt)
			i++
			continue
		}
		// Unknown escape — double it so the decoder sees a literal backslash
		b.WriteString("\\\\")
	}
	return b.String()
}

// CleanNarration strips markdown artefacts (**, *, smart quotes, em-dashes)
// from text that will be fed to a TTS engine.
func CleanNarration(text string) string {
	text = strings.ReplaceAll(text, "**", "")
	var out strings.Builder
	out.Grow(len(text))
	for _, r := range text {
		if r == '*' {
			continue
		}
		switch r {
		case '“', '”':
			out.WriteByte('"')
		case '‘', '’':
			out.WriteByte('\'')
		case '–', '—':
			out.WriteByte('-')
		default:
			if r >= 32 || r == '\n' {
				out.WriteRune(r)
			}
		}
	}
	return strings.TrimSpace(out.String())
}

// GenerateTitleIntro produces the spoken title-slide narration from paper metadata.
func GenerateTitleIntro(title, authors, date string) string {
	if title == "" {
		return ""
	}
	if authors == "" {
		authors = "the authors"
	} else if strings.Contains(authors, ",") {
		first := strings.TrimSpace(strings.SplitN(authors, ",", 2)[0])
		authors = first + " et al."
	}
	if date == "" {
		date = "recently"
	}
	return fmt.Sprintf(
		"Welcome to this presentation on %q. "+
			"This research was conducted by %s and published in %s. "+
			"Today, we'll explore the key findings and contributions of this important work. "+
			"Let's begin by understanding the problem this research addresses.",
		title, authors, date,
	)
}

// TruncateString returns the first n characters of s, appending "..." if truncated.
func TruncateString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// Truncate returns the first n UTF-8 runes of s, appending "…" if truncated.
func Truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

// ResolveAudienceLevel normalises the audience tier string to one of the three
// known values, defaulting to "intermediate".
func ResolveAudienceLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "novice":
		return "novice"
	case "expert":
		return "expert"
	default:
		return "intermediate"
	}
}

// ResolveTone normalises the tone string to "formal" or "conversational",
// defaulting to "formal" so old jobs without a tone field keep their current output.
func ResolveTone(t string) string {
	if strings.ToLower(strings.TrimSpace(t)) == "conversational" {
		return "conversational"
	}
	return "formal"
}

// DefaultString returns value if non-empty, otherwise fallback.
func DefaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
