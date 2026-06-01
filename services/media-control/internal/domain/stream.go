package domain

import (
	"fmt"
	"strings"
)

type StreamPath string

func NewStreamPath(value string) (StreamPath, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("stream path must not be blank")
	}
	if strings.HasPrefix(trimmed, "/") {
		return "", fmt.Errorf("stream path must be relative")
	}
	return StreamPath(trimmed), nil
}

type StreamStatus string

const (
	StreamStatusUnknown StreamStatus = "unknown"
	StreamStatusReady   StreamStatus = "ready"
	StreamStatusIdle    StreamStatus = "idle"
)

type StreamDescriptor struct {
	Path        StreamPath   `json:"path"`
	Ready       bool         `json:"ready"`
	Source      string       `json:"source,omitempty"`
	Status      StreamStatus `json:"status"`
	ReaderCount int          `json:"readerCount"`
}
