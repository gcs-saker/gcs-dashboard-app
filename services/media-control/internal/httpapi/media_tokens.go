package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const mediaTokenTTL = 5 * time.Minute

var errMediaTokenInvalid = errors.New("media token is invalid")

type mediaTokenPayload struct {
	StreamID  string `json:"streamId"`
	Action    string `json:"action"`
	Path      string `json:"path"`
	GroupID   string `json:"groupId"`
	ExpiresAt int64  `json:"exp"`
}

func issueMediaToken(secret string, action string, streamID string, streamPath string, groupID string, now time.Time) (string, error) {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(streamID) == "" || strings.TrimSpace(groupID) == "" {
		return "", errMediaTokenInvalid
	}
	payload := mediaTokenPayload{
		StreamID:  streamID,
		Action:    action,
		Path:      streamPath,
		GroupID:   groupID,
		ExpiresAt: now.Add(mediaTokenTTL).Unix(),
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature := signMediaTokenPayload(secret, encodedPayload)
	return encodedPayload + "." + signature, nil
}

func validateMediaToken(
	secret string,
	token string,
	action string,
	streamID string,
	streamPath string,
	groupID string,
	now time.Time,
) error {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(token) == "" {
		return errMediaTokenInvalid
	}
	encodedPayload, encodedSignature, ok := strings.Cut(token, ".")
	if !ok || encodedPayload == "" || encodedSignature == "" {
		return errMediaTokenInvalid
	}
	expectedSignature := signMediaTokenPayload(secret, encodedPayload)
	if !hmac.Equal([]byte(encodedSignature), []byte(expectedSignature)) {
		return errMediaTokenInvalid
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return errMediaTokenInvalid
	}
	var payload mediaTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return errMediaTokenInvalid
	}
	if payload.StreamID != streamID ||
		payload.Action != action ||
		payload.Path != streamPath ||
		payload.GroupID != groupID ||
		payload.ExpiresAt < now.Unix() {
		return errMediaTokenInvalid
	}
	return nil
}

func signMediaTokenPayload(secret string, encodedPayload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
