// Package keycrypt provides AES-256-GCM encryption/decryption for user API keys
// stored in the database.
package keycrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

const encPrefix = "enc:v1:"

func loadKey() ([]byte, error) {
	raw := os.Getenv("KEYS_ENCRYPTION_KEY")
	if raw == "" {
		return nil, nil
	}
	key, err := hex.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("KEYS_ENCRYPTION_KEY is not valid hex: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("KEYS_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got %d bytes", len(key))
	}
	return key, nil
}


func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	key, err := loadKey()
	if err != nil {
		return "", err
	}
	if key == nil {
		log.Println("[keycrypt] WARNING: KEYS_ENCRYPTION_KEY not set — storing API key as plaintext")
		return plaintext, nil
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("keycrypt: aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("keycrypt: gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("keycrypt: nonce: %w", err)
	}
	// Seal appends the ciphertext+tag to nonce so we get one contiguous slice.
	combined := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(combined), nil
}


func Decrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	if !strings.HasPrefix(value, encPrefix) {
		// Legacy plaintext row or local-dev unencrypted value — pass through.
		return value, nil
	}
	key, err := loadKey()
	if err != nil {
		return "", err
	}
	if key == nil {
		// Key not configured — return raw (can't decrypt).
		return value, nil
	}

	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil {
		return "", fmt.Errorf("keycrypt: base64 decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("keycrypt: aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("keycrypt: gcm: %w", err)
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return "", errors.New("keycrypt: ciphertext too short")
	}
	plaintext, err := gcm.Open(nil, data[:ns], data[ns:], nil)
	if err != nil {
		return "", fmt.Errorf("keycrypt: decrypt: %w", err)
	}
	return string(plaintext), nil
}
