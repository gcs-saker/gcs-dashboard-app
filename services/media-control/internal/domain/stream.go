package domain

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var streamSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

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

type ParsedStreamPath struct {
	Prefix      string
	AssetID     string
	SensorID    string
	ProcessorID string
	ArchiveDate string
	Path        string
	StreamID    string
}

func ParseStreamID(streamID string) (ParsedStreamPath, error) {
	trimmed := strings.TrimSpace(streamID)
	if trimmed == "" {
		return ParsedStreamPath{}, fmt.Errorf("stream id must be a non-empty string")
	}
	if strings.ContainsAny(trimmed, `/\`) {
		return ParsedStreamPath{}, fmt.Errorf("stream id must use dot separators only")
	}
	if strings.HasPrefix(trimmed, ".") || strings.HasSuffix(trimmed, ".") {
		return ParsedStreamPath{}, fmt.Errorf("stream id must not start or end with dot")
	}
	if strings.Contains(trimmed, "..") {
		return ParsedStreamPath{}, fmt.Errorf("stream id must not contain empty segments")
	}
	return ParseStreamPath(strings.ReplaceAll(trimmed, ".", "/"))
}

func ParseStreamPath(path string) (ParsedStreamPath, error) {
	streamPath, err := NewStreamPath(path)
	if err != nil {
		return ParsedStreamPath{}, err
	}

	parts := strings.Split(string(streamPath), "/")
	if hasEmptySegment(parts) {
		return ParsedStreamPath{}, fmt.Errorf("stream path must not contain empty segments")
	}

	switch parts[0] {
	case "raw":
		if len(parts) != 3 {
			return ParsedStreamPath{}, fmt.Errorf("stream path must match raw/{assetId}/{sensorId}")
		}
		if err := validateSegments(parts[1:]...); err != nil {
			return ParsedStreamPath{}, err
		}
		return parsedPath("raw", parts[1], parts[2], "", ""), nil
	case "ai":
		if len(parts) != 4 {
			return ParsedStreamPath{}, fmt.Errorf("stream path must match ai/{assetId}/{sensorId}/{processorId}")
		}
		if err := validateSegments(parts[1:]...); err != nil {
			return ParsedStreamPath{}, err
		}
		return parsedPath("ai", parts[1], parts[2], parts[3], ""), nil
	case "archive":
		if len(parts) != 4 {
			return ParsedStreamPath{}, fmt.Errorf("stream path must match archive/{assetId}/{sensorId}/{date}")
		}
		if err := validateSegments(parts[1], parts[2]); err != nil {
			return ParsedStreamPath{}, err
		}
		if _, err := time.Parse("2006-01-02", parts[3]); err != nil {
			return ParsedStreamPath{}, fmt.Errorf("archive stream date must be a valid calendar date")
		}
		return parsedPath("archive", parts[1], parts[2], "", parts[3]), nil
	default:
		return ParsedStreamPath{}, fmt.Errorf("stream path prefix must be one of raw, ai, archive")
	}
}

func parsedPath(prefix string, assetID string, sensorID string, processorID string, archiveDate string) ParsedStreamPath {
	parts := []string{prefix, assetID, sensorID}
	if processorID != "" {
		parts = append(parts, processorID)
	}
	if archiveDate != "" {
		parts = append(parts, archiveDate)
	}
	path := strings.Join(parts, "/")
	return ParsedStreamPath{
		Prefix:      prefix,
		AssetID:     assetID,
		SensorID:    sensorID,
		ProcessorID: processorID,
		ArchiveDate: archiveDate,
		Path:        path,
		StreamID:    strings.ReplaceAll(path, "/", "."),
	}
}

func hasEmptySegment(parts []string) bool {
	for _, part := range parts {
		if part == "" {
			return true
		}
	}
	return false
}

func validateSegments(segments ...string) error {
	for _, segment := range segments {
		if segment == "." || segment == ".." {
			return fmt.Errorf("stream path must not contain traversal segments")
		}
		if !streamSegmentPattern.MatchString(segment) {
			return fmt.Errorf("stream path segments may contain only letters, numbers, hyphen, and underscore")
		}
	}
	return nil
}
