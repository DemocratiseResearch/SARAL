package wav

import "fmt"

const (
	DefaultSampleRate    uint32 = 22050
	DefaultNumChannels   uint16 = 1
	DefaultBitsPerSample uint16 = 16
)

// Parse scans a WAV blob, extracts audio format parameters from the fmt chunk,
// and returns the raw PCM bytes from the data chunk.
func Parse(b []byte) (sampleRate uint32, numChannels uint16, bitsPerSample uint16, pcm []byte, err error) {
	if len(b) < 44 {
		return 0, 0, 0, nil, fmt.Errorf("WAV too short: %d bytes", len(b))
	}
	if string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return 0, 0, 0, nil, fmt.Errorf("invalid RIFF/WAVE header")
	}
	offset := 12
	for offset+8 <= len(b) {
		id := string(b[offset : offset+4])
		size := int(leUint32(b[offset+4 : offset+8]))
		payload := b[offset+8:]
		if size > len(payload) {
			size = len(payload)
		}
		switch id {
		case "fmt ":
			if size < 16 {
				return 0, 0, 0, nil, fmt.Errorf("fmt chunk too small: %d bytes", size)
			}
			numChannels = leUint16(payload[2:4])
			sampleRate = leUint32(payload[4:8])
			bitsPerSample = leUint16(payload[14:16])
		case "data":
			pcm = payload[:size]
			return sampleRate, numChannels, bitsPerSample, pcm, nil
		}
		offset += 8 + size
		if size%2 != 0 {
			offset++
		}
	}
	return 0, 0, 0, nil, fmt.Errorf("no data chunk found in WAV file")
}

// BuildSilence returns a valid PCM/WAV file containing seconds of silence
// at 22050 Hz, mono, 16-bit.
func BuildSilence(seconds float64) []byte {
	if seconds < 0.5 {
		seconds = 0.5
	}
	if seconds > 20 {
		seconds = 20
	}
	numSamples := uint32(seconds * float64(DefaultSampleRate))
	dataLen := int(numSamples) * int(DefaultNumChannels) * int(DefaultBitsPerSample/8)
	pcm := make([]byte, dataLen)
	return Encode(pcm, DefaultSampleRate, DefaultNumChannels, DefaultBitsPerSample)
}

// Encode wraps raw PCM bytes in a RIFF/WAV header and returns the complete WAV file.
func Encode(pcm []byte, sampleRate uint32, numChannels, bitsPerSample uint16) []byte {
	dataLen := len(pcm)
	byteRate := sampleRate * uint32(numChannels) * uint32(bitsPerSample/8)
	blockAlign := numChannels * bitsPerSample / 8

	wav := make([]byte, 0, 44+dataLen)
	wav = append(wav, 'R', 'I', 'F', 'F')
	wav = AppendLE32(wav, uint32(36+dataLen))
	wav = append(wav, 'W', 'A', 'V', 'E')
	wav = append(wav, 'f', 'm', 't', ' ')
	wav = AppendLE32(wav, 16)
	wav = AppendLE16(wav, 1) // PCM
	wav = AppendLE16(wav, numChannels)
	wav = AppendLE32(wav, sampleRate)
	wav = AppendLE32(wav, byteRate)
	wav = AppendLE16(wav, blockAlign)
	wav = AppendLE16(wav, bitsPerSample)
	wav = append(wav, 'd', 'a', 't', 'a')
	wav = AppendLE32(wav, uint32(dataLen))
	wav = append(wav, pcm...)
	return wav
}

// HasHeader reports whether b begins with a RIFF/WAVE header.
func HasHeader(b []byte) bool {
	return len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WAVE"
}

func AppendLE16(buf []byte, val uint16) []byte {
	return append(buf, byte(val), byte(val>>8))
}

func AppendLE32(buf []byte, val uint32) []byte {
	return append(buf, byte(val), byte(val>>8), byte(val>>16), byte(val>>24))
}

func leUint16(b []byte) uint16 {
	return uint16(b[0]) | uint16(b[1])<<8
}

func leUint32(b []byte) uint32 {
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}
