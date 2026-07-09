package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

func getenv(key envName, fallback string) string {
	value := strings.TrimSpace(os.Getenv(string(key)))
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
