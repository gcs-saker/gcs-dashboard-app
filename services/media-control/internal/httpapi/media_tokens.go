package httpapi

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const mediaTokenTTL = 5 * time.Minute

const mediaTokenPrefix = "gcs_media_v2_"

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
	return encryptMediaToken(secret, payloadBytes)
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
	return encryptMediaToken(secret, payloadBytes)
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
	if !strings.HasPrefix(token, mediaTokenPrefix) {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	sealed, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(token, mediaTokenPrefix))
	if err != nil {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	aead, err := newMediaTokenAEAD(secret)
	if err != nil || len(sealed) <= aead.NonceSize() {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	payloadBytes, err := aead.Open(nil, nonce, ciphertext, []byte(mediaTokenPrefix))
	if err != nil {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	var payload mediaTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return mediaTokenPayload{}, errMediaTokenInvalid
	}
	return payload, nil
}

func encryptMediaToken(secret string, payload []byte) (string, error) {
	aead, err := newMediaTokenAEAD(secret)
	if err != nil {
		return "", errMediaTokenInvalid
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, payload, []byte(mediaTokenPrefix))
	return mediaTokenPrefix + base64.RawURLEncoding.EncodeToString(sealed), nil
}

func newMediaTokenAEAD(secret string) (cipher.AEAD, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, errMediaTokenInvalid
	}
	key := sha256.Sum256([]byte("gcs-saker/media-token/v2\x00" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
