package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const (
	publishAccessTTL  = 3 * time.Minute
	publishRenewalTTL = 45 * time.Minute
)

type createPublishSessionRequest struct {
	SensorID string `json:"sensorId"`
}

type publishSessionResponse struct {
	SessionID             string              `json:"sessionId"`
	StreamID              string              `json:"streamId"`
	Protocol              string              `json:"protocol"`
	PublishURL            string              `json:"publishUrl"`
	PublishToken          string              `json:"publishToken"`
	RenewalToken          string              `json:"renewalToken"`
	PublishTokenExpiresAt string              `json:"publishTokenExpiresAt"`
	RenewalTokenExpiresAt string              `json:"renewalTokenExpiresAt"`
	AuthorizationScheme   string              `json:"authorizationScheme"`
	IceServers            []iceServerResponse `json:"iceServers"`
}

type renewPublishSessionResponse struct {
	PublishToken          string `json:"publishToken"`
	RenewalToken          string `json:"renewalToken"`
	PublishTokenExpiresAt string `json:"publishTokenExpiresAt"`
	RenewalTokenExpiresAt string `json:"renewalTokenExpiresAt"`
}

func (s Server) devicePublishSessions(w http.ResponseWriter, r *http.Request) {
	if s.devicePublisher == nil || s.publishSessions == nil || strings.TrimSpace(s.publishToken) == "" {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	if r.URL.Path == routeDevicePublishSessions {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.createDevicePublishSession(w, r)
		return
	}
	trimmed := strings.TrimPrefix(r.URL.Path, routeDevicePublishSessionPrefix)
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 2 && parts[1] == "renew" && r.Method == http.MethodPost {
		s.renewDevicePublishSession(w, r, parts[0])
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.endDevicePublishSession(w, r, parts[0])
		return
	}
	http.NotFound(w, r)
}

func (s Server) createDevicePublishSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	deviceUUID := strings.TrimSpace(r.Header.Get(deviceUUIDHeader))
	credential := strings.TrimSpace(r.Header.Get(deviceCredentialHeader))
	if deviceUUID == "" || credential == "" {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errDevicePublisherAuthRequired))
		return
	}
	defer r.Body.Close()
	var request createPublishSessionRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, errorPayload(errPublishSessionInvalid))
		return
	}
	authorization, err := s.devicePublisher.AuthorizeDevicePublish(r.Context(), domain.DevicePublishCommand{
		DeviceUUID: deviceUUID, Credential: credential, SensorID: strings.TrimSpace(request.SensorID),
	})
	if err != nil {
		s.auditDeviceSession(r, "publish_session_denied", deviceUUID, "denied")
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	now := s.now()
	renewalToken, err := secureOpaqueToken("gcs_renew_")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	sessionID, err := secureOpaqueToken("ps_")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	session := domain.PublishSession{
		SessionID: sessionID, DeviceUUID: authorization.DeviceUUID, SensorID: authorization.SensorID,
		StreamID: authorization.StreamID, Path: authorization.Path, GroupID: authorization.PublisherGroupID,
		CredentialVersion: authorization.CredentialVersion, DevicePolicyVersion: authorization.DevicePolicyVersion,
		Status: domain.PublishSessionActive, RenewalTokenHash: s.hashRenewalToken(renewalToken), RenewalTokenVersion: 1,
		PublishTokenExpiresAt: now.Add(publishAccessTTL), RenewalTokenExpiresAt: now.Add(publishRenewalTTL),
		CreatedAt: now, UpdatedAt: now,
	}
	if err := s.publishSessions.Save(r.Context(), session); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	publishToken, err := issueDeviceMediaToken(s.publishToken, session, mustOpaqueToken("jti_"), now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	parsed, err := domain.ParseStreamPath(session.Path)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload(errPublisherAuthFailed))
		return
	}
	urls := s.playback.Build(parsed)
	publishURL := strings.TrimSuffix(urls.WebRTC, "/whep") + "/whip"
	s.auditDeviceSession(r, "publish_session_created", deviceUUID, "allowed")
	writeJSON(w, http.StatusCreated, publishSessionResponse{
		SessionID: session.SessionID, StreamID: session.StreamID, Protocol: "whip", PublishURL: publishURL,
		PublishToken: publishToken, RenewalToken: renewalToken,
		PublishTokenExpiresAt: session.PublishTokenExpiresAt.UTC().Format(time.RFC3339),
		RenewalTokenExpiresAt: session.RenewalTokenExpiresAt.UTC().Format(time.RFC3339),
		AuthorizationScheme:   "Bearer", IceServers: s.iceServerResponses(),
	})
}

func (s Server) renewDevicePublishSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	w.Header().Set("Cache-Control", "no-store, private")
	raw := bearerToken(r.Header.Get(authorizationHeader))
	if raw == "" {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errPublishSessionRenewalDenied))
		return
	}
	now := s.now()
	nextRenewal, err := secureOpaqueToken("gcs_renew_")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	session, result, storeErr := s.publishSessions.RotateRenewal(
		r.Context(),
		sessionID, s.hashRenewalToken(raw), s.hashRenewalToken(nextRenewal),
		now.Add(publishAccessTTL), now.Add(publishRenewalTTL), now,
	)
	if storeErr != nil {
		w.Header().Set("Retry-After", "1")
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	if result != domain.RenewalRotated {
		// Only a confirmed replay of the immediately previous token terminates the
		// session. Random mismatches must not become a session-termination oracle.
		s.auditDeviceSession(r, "publish_session_renewal_rejected", "", "denied")
		writeJSON(w, http.StatusUnauthorized, errorPayload(errPublishSessionRenewalDenied))
		return
	}
	publishToken, err := issueDeviceMediaToken(s.publishToken, session, mustOpaqueToken("jti_"), now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	s.auditDeviceSession(r, "publish_session_renewed", session.DeviceUUID, "allowed")
	writeJSON(w, http.StatusOK, renewPublishSessionResponse{
		PublishToken: publishToken, RenewalToken: nextRenewal,
		PublishTokenExpiresAt: session.PublishTokenExpiresAt.UTC().Format(time.RFC3339),
		RenewalTokenExpiresAt: session.RenewalTokenExpiresAt.UTC().Format(time.RFC3339),
	})
}

func (s Server) endDevicePublishSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	raw := bearerToken(r.Header.Get(authorizationHeader))
	session, findErr := s.publishSessions.Find(r.Context(), sessionID)
	if errors.Is(findErr, domain.ErrPublishSessionStoreUnavailable) {
		w.Header().Set("Retry-After", "1")
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	if raw == "" || findErr != nil || !hmac.Equal(session.RenewalTokenHash, s.hashRenewalToken(raw)) {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errPublishSessionRenewalDenied))
		return
	}
	if err := s.publishSessions.End(r.Context(), sessionID, s.now()); err != nil {
		w.Header().Set("Retry-After", "1")
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	s.auditDeviceSession(r, "publish_session_ended", session.DeviceUUID, "allowed")
	w.WriteHeader(http.StatusNoContent)
}

func (s Server) validateActivePublishSession(payload mediaTokenPayload, now time.Time) bool {
	if payload.SessionID == "" {
		return true
	} // Legacy token compatibility during migration.
	session, err := s.publishSessions.Find(context.Background(), payload.SessionID)
	return err == nil && session.ActiveAt(now) && session.DeviceUUID == payload.DeviceUUID &&
		session.SensorID == payload.SensorID && session.StreamID == payload.StreamID && session.Path == payload.Path &&
		session.GroupID == payload.GroupID && session.CredentialVersion == payload.CredentialVersion &&
		session.DevicePolicyVersion == payload.DevicePolicyVersion
}

func secureOpaqueToken(prefix string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

func mustOpaqueToken(prefix string) string {
	token, err := secureOpaqueToken(prefix)
	if err != nil {
		panic(err)
	}
	return token
}
func (s Server) hashRenewalToken(token string) []byte {
	mac := hmac.New(sha256.New, []byte(s.publishToken))
	mac.Write([]byte(token))
	return mac.Sum(nil)
}
func bearerToken(value string) string {
	scheme, token, ok := strings.Cut(strings.TrimSpace(value), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

func (s Server) auditDeviceSession(r *http.Request, event, deviceUUID, result string) {
	ip := clientIP(r)
	mac := hmac.New(sha256.New, []byte(s.publishToken))
	mac.Write([]byte(ip))
	ipFingerprint := base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:12])
	log.Printf("security_audit event=%s result=%s device=%s client_ip_hash=%s", event, result, maskDeviceUUID(deviceUUID), ipFingerprint)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(strings.TrimSpace(host))
	if peer != nil && (peer.IsLoopback() || peer.IsPrivate()) {
		if first, _, ok := strings.Cut(r.Header.Get(forwardedForHeader), ","); ok || strings.TrimSpace(first) != "" {
			if parsed := net.ParseIP(strings.TrimSpace(first)); parsed != nil {
				return parsed.String()
			}
		}
	}
	if peer == nil {
		return "unknown"
	}
	return peer.String()
}

func maskDeviceUUID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 8 {
		return "redacted"
	}
	return value[:8] + "-redacted"
}
