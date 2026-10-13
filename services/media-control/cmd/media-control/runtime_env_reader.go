package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const maximumSecretFileBytes = 4096

func getenv(key envName, fallback string) string {
	value := strings.TrimSpace(os.Getenv(string(key)))
	if value == "" {
		return fallback
	}
	return value
}

func getenvSecret(key envName, fallback string) (string, error) {
	environmentValue := strings.TrimSpace(os.Getenv(string(key)))
	configuredFile := strings.TrimSpace(os.Getenv(string(key) + "_FILE"))
	secretFile := configuredFile
	if secretFile == "" {
		candidate := filepath.Join("/run/secrets", string(key))
		if _, err := os.Stat(candidate); err == nil {
			secretFile = candidate
		}
	}
	if environmentValue != "" && secretFile != "" {
		return "", fmt.Errorf("%s and %s_FILE cannot both be configured", key, key)
	}
	if environmentValue != "" || secretFile == "" {
		return valueOrFallback(environmentValue, fallback), nil
	}
	return readSecretFile(key, secretFile)
}

func readSecretFile(key envName, path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s_FILE must be absolute", key)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("%s_FILE cannot be read", key)
	}
	if len(contents) == 0 || len(contents) > maximumSecretFileBytes {
		return "", fmt.Errorf("%s_FILE size is invalid", key)
	}
	value := strings.TrimSpace(string(contents))
	if value == "" {
		return "", fmt.Errorf("%s_FILE must not be empty", key)
	}
	return value, nil
}

func valueOrFallback(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func getenvDuration(key envName, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(string(key)))
	if value == "" {
		return fallback
	}
	seconds, err := strconv.ParseFloat(value, 64)
	if err != nil || seconds < 0 {
		return fallback
	}
	return time.Duration(seconds * float64(time.Second))
}

func getenvInt(key envName, fallback int) int {
	value := strings.TrimSpace(os.Getenv(string(key)))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return fallback
	}
	return parsed
}
