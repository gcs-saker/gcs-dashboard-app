package mission

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidMission    = errors.New("mission_invalid")
	ErrConfirmation      = errors.New("operator_confirmation_required")
	ErrCommandExpired    = errors.New("mission_command_expired")
	ErrSessionMismatch   = errors.New("mission_session_mismatch")
	ErrAccessDenied      = errors.New("mission_access_denied")
	ErrGeofenceViolation = errors.New("mission_geofence_violation")
	ErrDuplicateCommand  = errors.New("mission_command_duplicate")
)

type AltitudeDatum string

const (
	AltitudeAGL AltitudeDatum = "AGL"
	AltitudeMSL AltitudeDatum = "MSL"
)

type Waypoint struct {
	Sequence    int
	Latitude    float64
	Longitude   float64
	AltitudeM   float64
	HoldSeconds int
	Action      string
}

type DispatchRequest struct {
	MissionID         string
	MissionRevision   int64
	CommandID         string
	AssetUUID         string
	AssetSessionID    string
	IssuedAt          time.Time
	ExpiresAt         time.Time
	AltitudeDatum     AltitudeDatum
	OperatorConfirmed bool
	Waypoints         []Waypoint
}

type ActiveAssetSession struct {
	SessionID string
	AssetUUID string
	GroupID   string
	Active    bool
}

type DispatchEnvelope struct {
	Request DispatchRequest
	GroupID string
}

type SessionResolver interface {
	ResolveActiveSession(context.Context, string) (ActiveAssetSession, error)
}

type Authorizer interface {
	CanControl(context.Context, string, string) (bool, error)
}

type Geofence interface {
	AllowsRoute(context.Context, []Waypoint, AltitudeDatum) (bool, error)
}

type CommandLedger interface {
	Reserve(context.Context, string, time.Time) (bool, error)
}

type Service struct {
	Sessions SessionResolver
	Policy   Authorizer
	Geofence Geofence
	Commands CommandLedger
	Now      func() time.Time
}

func (s Service) Dispatch(ctx context.Context, principal string, request DispatchRequest) (DispatchEnvelope, error) {
	if err := validateRequest(request, s.Now()); err != nil {
		return DispatchEnvelope{}, err
	}
	session, err := s.resolveAuthorizedSession(ctx, principal, request)
	if err != nil {
		return DispatchEnvelope{}, err
	}
	if err := s.reserveSafeRoute(ctx, request); err != nil {
		return DispatchEnvelope{}, err
	}
	return DispatchEnvelope{Request: request, GroupID: session.GroupID}, nil
}

func (s Service) resolveAuthorizedSession(ctx context.Context, principal string, request DispatchRequest) (ActiveAssetSession, error) {
	session, err := s.Sessions.ResolveActiveSession(ctx, request.AssetSessionID)
	if err != nil || !session.Active || session.AssetUUID != request.AssetUUID || session.SessionID != request.AssetSessionID {
		return ActiveAssetSession{}, ErrSessionMismatch
	}
	allowed, err := s.Policy.CanControl(ctx, principal, session.GroupID)
	if err != nil || !allowed {
		return ActiveAssetSession{}, ErrAccessDenied
	}
	return session, nil
}

func (s Service) reserveSafeRoute(ctx context.Context, request DispatchRequest) error {
	inside, err := s.Geofence.AllowsRoute(ctx, request.Waypoints, request.AltitudeDatum)
	if err != nil || !inside {
		return ErrGeofenceViolation
	}
	reserved, err := s.Commands.Reserve(ctx, request.CommandID, request.ExpiresAt)
	if err != nil || !reserved {
		return ErrDuplicateCommand
	}
	return nil
}

func validateRequest(request DispatchRequest, now time.Time) error {
	if hasMissingIdentity(request) {
		return ErrInvalidMission
	}
	if !request.OperatorConfirmed {
		return ErrConfirmation
	}
	if hasInvalidLifetime(request, now) {
		return ErrCommandExpired
	}
	if request.AltitudeDatum != AltitudeAGL && request.AltitudeDatum != AltitudeMSL {
		return ErrInvalidMission
	}
	if !hasValidWaypoints(request.Waypoints) {
		return ErrInvalidMission
	}
	return nil
}

func hasMissingIdentity(request DispatchRequest) bool {
	return request.MissionID == "" || request.MissionRevision < 1 || request.CommandID == "" ||
		request.AssetUUID == "" || request.AssetSessionID == ""
}

func hasInvalidLifetime(request DispatchRequest, now time.Time) bool {
	return request.IssuedAt.After(now) || !request.ExpiresAt.After(now) || !request.ExpiresAt.After(request.IssuedAt)
}

func hasValidWaypoints(waypoints []Waypoint) bool {
	if len(waypoints) == 0 || len(waypoints) > 200 {
		return false
	}
	for index, waypoint := range waypoints {
		if !isValidWaypoint(waypoint, index+1) {
			return false
		}
	}
	return true
}

func isValidWaypoint(waypoint Waypoint, expectedSequence int) bool {
	return waypoint.Sequence == expectedSequence && waypoint.Latitude >= -90 && waypoint.Latitude <= 90 &&
		waypoint.Longitude >= -180 && waypoint.Longitude <= 180 && waypoint.HoldSeconds >= 0 && waypoint.HoldSeconds <= 3600
}
