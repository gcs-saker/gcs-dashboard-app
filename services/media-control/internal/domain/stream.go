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
	StreamStatusRegistered StreamStatus = "registered"
	StreamStatusOnline     StreamStatus = "online"
	StreamStatusOffline    StreamStatus = "offline"
	StreamStatusUnknown    StreamStatus = "unknown"
)

type StreamDescriptor struct {
	Path        StreamPath   `json:"path"`
	Ready       bool         `json:"ready"`
	Source      string       `json:"source,omitempty"`
	Status      StreamStatus `json:"status"`
	ReaderCount int          `json:"readerCount"`
}

type StreamList struct {
	values []StreamDescriptor
}

func NewStreamList(streams []StreamDescriptor) StreamList {
	values := append([]StreamDescriptor(nil), streams...)
	return StreamList{values: values}
}

func (l StreamList) Values() []StreamDescriptor {
	return append([]StreamDescriptor(nil), l.values...)
}

func (l StreamList) Len() int {
	return len(l.values)
}

func (l StreamList) ForEach(fn func(StreamDescriptor)) {
	for _, stream := range l.values {
		fn(stream)
	}
}
