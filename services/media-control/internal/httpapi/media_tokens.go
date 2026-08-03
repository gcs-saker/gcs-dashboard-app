package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const mediaTokenTTL = 5 * time.Minute

var errMediaTokenInvalid = errors.New("media token is invalid")

type mediaTokenPayload struct {
	StreamID            string `json:"streamId"`
	Action              string `json:"action"`
	Path                string `json:"path"`
	GroupID             string `json:"groupId"`
	SessionID           string `json:"sessionId,omitempty"`
	DeviceUUID          string `json:"deviceUuid,omitempty"`
	SensorID            string `json:"sensorId,omitempty"`
	CredentialVersion   int64  `json:"credentialVersion,omitempty"`
	DevicePolicyVersion int64  `json:"devicePolicyVersion,omitempty"`
	TokenID             string `json:"jti,omitempty"`
	ExpiresAt           int64  `json:"exp"`
}

func issueDeviceMediaToken(secret string, session domain.PublishSession, tokenID string, now time.Time) (string, error) {
	if strings.TrimSpace(secret) == "" || !session.ActiveAt(now) || tokenID == "" {
		return "", errMediaTokenInvalid
	}
	payload := mediaTokenPayload{
		StreamID: session.StreamID, Action: mediaMTXActionPublish, Path: session.Path, GroupID: session.GroupID,
		SessionID: session.SessionID, DeviceUUID: session.DeviceUUID, SensorID: session.SensorID,
		CredentialVersion: session.CredentialVersion, DevicePolicyVersion: session.DevicePolicyVersion,
		TokenID: tokenID, ExpiresAt: session.PublishTokenExpiresAt.Unix(),
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payloadBytes)
	return encoded + "." + signMediaTokenPayload(secret, encoded), nil
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
	payload, err := decodeVerifiedMediaToken(secret, token)
	if err != nil {
		return err
	}
	if payload.StreamID != streamID ||
		payload.Action != action ||
		payload.Path != streamPath ||
		payload.GroupID != groupID ||
		payload.ExpiresAt <= now.Unix() {
		return errMediaTokenInvalid
	}
	return nil
}

func validateMediaTokenForRoute(
	secret string,
	token string,
	action string,
	streamID string,
	streamPath string,
	now time.Time,
) (mediaTokenPayload, error) {
	payload, err := decodeVerifiedMediaToken(secret, token)
	if err != nil {
		return mediaTokenPayload{}, err
	}
	if payload.StreamID != streamID ||
		payload.Action != action ||
		payload.Path != streamPath ||
		payload.GroupID == "" ||
		payload.ExpiresAt <= now.Unix() {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	return payload, nil
}

func decodeVerifiedMediaToken(secret string, token string) (mediaTokenPayload, error) {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(token) == "" {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	encodedPayload, encodedSignature, ok := strings.Cut(token, ".")
	if !ok || encodedPayload == "" || encodedSignature == "" {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	expectedSignature := signMediaTokenPayload(secret, encodedPayload)
	if !hmac.Equal([]byte(encodedSignature), []byte(expectedSignature)) {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	var payload mediaTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	return payload, nil
}

func signMediaTokenPayload(secret string, encodedPayload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
