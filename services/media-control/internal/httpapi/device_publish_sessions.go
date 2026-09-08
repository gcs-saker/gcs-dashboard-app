package httpapi

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
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
	s.routePublishSessionRequest(w, r, publishSessionRoutes{
		collection: routeDevicePublishSessions,
		prefix:     routeDevicePublishSessionPrefix,
	}, s.createDevicePublishSession)
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
		switch {
		case errors.Is(err, domain.ErrDevicePublishAccessDenied):
			writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		case errors.Is(err, domain.ErrDevicePublishPolicyInvalid):
			writeJSON(w, http.StatusBadRequest, errorPayload(errPublishSessionInvalid))
		default:
			writeJSON(w, http.StatusBadGateway, errorPayload(errAuthorizationUnavailable))
		}
		return
	}
	s.issuePublishSession(w, r, authorization, deviceUUID)
}

func (s Server) issuePublishSession(
	w http.ResponseWriter,
	r *http.Request,
	authorization domain.DevicePublishAuthorization,
	auditIdentity string,
) {
	response, err := s.createPublishSession(r.Context(), authorization)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	s.auditDeviceSession(r, "publish_session_created", auditIdentity, "allowed")
	writeJSON(w, http.StatusCreated, response)
}

func (s Server) createPublishSession(ctx context.Context, authorization domain.DevicePublishAuthorization) (publishSessionResponse, error) {
	publicStreamID, publicPath := opaqueDeviceStreamIdentity(
		s.publishToken,
		authorization.DeviceUUID,
		authorization.SensorID,
	)
	now := s.now()
	renewalToken, err := secureOpaqueToken("gcs_renew_")
	if err != nil {
		return publishSessionResponse{}, err
	}
	sessionID, err := secureOpaqueToken("ps_")
	if err != nil {
		return publishSessionResponse{}, err
	}
	session := domain.PublishSession{
		SessionID: sessionID, DeviceUUID: authorization.DeviceUUID, SensorID: authorization.SensorID,
		StreamID: publicStreamID, Path: publicPath, GroupID: authorization.PublisherGroupID,
		CredentialVersion: authorization.CredentialVersion, DevicePolicyVersion: authorization.DevicePolicyVersion,
		Status: domain.PublishSessionActive, RenewalTokenHash: s.hashRenewalToken(renewalToken), RenewalTokenVersion: 1,
		PublishTokenExpiresAt: now.Add(publishAccessTTL), RenewalTokenExpiresAt: now.Add(publishRenewalTTL),
		CreatedAt: now, UpdatedAt: now,
	}
	if err := s.publishSessions.Save(ctx, session); err != nil {
		return publishSessionResponse{}, err
	}
	publishToken, err := sessiontoken.IssueDevice(s.publishToken, session, mustOpaqueToken("jti_"), now)
	if err != nil {
		return publishSessionResponse{}, err
	}
	parsed, err := domain.ParseStreamPath(session.Path)
	if err != nil {
		return publishSessionResponse{}, err
	}
	urls := s.playback.Build(parsed)
	publishURL := strings.TrimSuffix(urls.WebRTC, "/whep") + "/whip"
	return publishSessionResponse{
		SessionID: session.SessionID, StreamID: session.StreamID, Protocol: "whip", PublishURL: publishURL,
		PublishToken: publishToken, RenewalToken: renewalToken,
		PublishTokenExpiresAt: session.PublishTokenExpiresAt.UTC().Format(time.RFC3339),
		RenewalTokenExpiresAt: session.RenewalTokenExpiresAt.UTC().Format(time.RFC3339),
		AuthorizationScheme:   "Bearer", IceServers: s.iceServerResponses(),
	}, nil
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
	publishToken, err := sessiontoken.IssueDevice(s.publishToken, session, mustOpaqueToken("jti_"), now)
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

func (s Server) validateActivePublishSession(payload sessiontoken.Payload, now time.Time) bool {
	if payload.SessionID == "" {
		return s.legacyTokenHasActiveScope(payload)
	}
	if s.publishSessions == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionLookupTimeout)
	defer cancel()
	session, err := s.publishSessions.Find(ctx, payload.SessionID)
	if err != nil {
		return false
	}
	current, err := s.publishSessions.FindByStream(ctx, session.StreamID)
	if err != nil || current.SessionID != session.SessionID {
		return false
	}
	if s.sessionValidator != nil && session.CredentialVersion > 0 {
		if err := s.sessionValidator.ValidateSessionBinding(ctx, session); err != nil {
			return false
		}
	}
	return session.ActiveAt(now) && sessiontoken.MatchesSession(payload, session)
}

func (s Server) legacyTokenHasActiveScope(payload sessiontoken.Payload) bool {
	parsed, err := domain.ParseStreamPath(payload.Path)
	if err != nil {
		return false
	}
	if parsed.Prefix == "talkback" {
		parsed, err = domain.ParseStreamPath("raw/" + parsed.AssetID + "/" + parsed.SensorID)
		if err != nil {
			return false
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionLookupTimeout)
	defer cancel()
	target, err := s.resolveStreamTarget(ctx, parsed)
	return err == nil && target.PublisherGroupID == payload.GroupID
}
