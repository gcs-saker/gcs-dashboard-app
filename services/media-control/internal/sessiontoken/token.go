package sessiontoken

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

const TTL = 5 * time.Minute

const Prefix = "gcs_media_v2_"

var ErrInvalid = errors.New("media token is invalid")

type Payload struct {
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

func IssueDevice(secret string, session domain.PublishSession, tokenID string, now time.Time) (string, error) {
	if strings.TrimSpace(secret) == "" || !session.ActiveAt(now) || tokenID == "" {
		return "", ErrInvalid
	}
	payload := Payload{
		StreamID: session.StreamID, Action: "publish", Path: session.Path, GroupID: session.GroupID,
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

func Issue(secret string, action string, streamID string, streamPath string, groupID string, now time.Time) (string, error) {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(streamID) == "" || strings.TrimSpace(groupID) == "" {
		return "", ErrInvalid
	}
	payload := Payload{
		StreamID:  streamID,
		Action:    action,
		Path:      streamPath,
		GroupID:   groupID,
		ExpiresAt: now.Add(TTL).Unix(),
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return encryptMediaToken(secret, payloadBytes)
}

func Validate(
	secret string,
	token string,
	action string,
	streamID string,
	streamPath string,
	groupID string,
	now time.Time,
) error {
	payload, err := decodeVerified(secret, token)
	if err != nil {
		return err
	}
	if payload.StreamID != streamID ||
		payload.Action != action ||
		payload.Path != streamPath ||
		payload.GroupID != groupID ||
		payload.ExpiresAt <= now.Unix() {
		return ErrInvalid
	}
	return nil
}

func ValidateForRoute(
	secret string,
	token string,
	action string,
	streamID string,
	streamPath string,
	now time.Time,
) (Payload, error) {
	payload, err := decodeVerified(secret, token)
	if err != nil {
		return Payload{}, err
	}
	if payload.StreamID != streamID ||
		payload.Action != action ||
		payload.Path != streamPath ||
		payload.GroupID == "" ||
		payload.ExpiresAt <= now.Unix() {
		return Payload{}, ErrInvalid
	}
	return payload, nil
}

func decodeVerified(secret string, token string) (Payload, error) {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(token) == "" {
		return Payload{}, ErrInvalid
	}
	if !strings.HasPrefix(token, Prefix) {
		return Payload{}, ErrInvalid
	}
	sealed, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(token, Prefix))
	if err != nil {
		return Payload{}, ErrInvalid
	}
	aead, err := newMediaTokenAEAD(secret)
	if err != nil || len(sealed) <= aead.NonceSize() {
		return Payload{}, ErrInvalid
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	payloadBytes, err := aead.Open(nil, nonce, ciphertext, []byte(Prefix))
	if err != nil {
		return Payload{}, ErrInvalid
	}
	var payload Payload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return Payload{}, ErrInvalid
	}
	return payload, nil
}

func encryptMediaToken(secret string, payload []byte) (string, error) {
	aead, err := newMediaTokenAEAD(secret)
	if err != nil {
		return "", ErrInvalid
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, payload, []byte(Prefix))
	return Prefix + base64.RawURLEncoding.EncodeToString(sealed), nil
}

func newMediaTokenAEAD(secret string) (cipher.AEAD, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, ErrInvalid
	}
	key := sha256.Sum256([]byte("gcs-saker/media-token/v2\x00" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
