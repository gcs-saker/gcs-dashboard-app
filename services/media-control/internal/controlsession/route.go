package controlsession

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

var (
	ErrRouteUnavailable = errors.New("control_route_unavailable")
	ErrSessionStale     = errors.New("control_session_stale")
	ErrDeviceMismatch   = errors.New("control_device_mismatch")
	opaqueSegment       = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)
)

type RouteRequest struct {
	DeviceID       string
	PublishSession string
	Now            time.Time
}

type InternalRoute struct {
	deviceID       string
	groupID        string
	publishSession string
	commandTopic   string
}

func (r InternalRoute) DeviceID() string       { return r.deviceID }
func (r InternalRoute) GroupID() string        { return r.groupID }
func (r InternalRoute) PublishSession() string { return r.publishSession }
func (r InternalRoute) CommandTopic() string   { return r.commandTopic }

type RouteResolver struct{ sessions domain.PublishSessionStore }

func NewRouteResolver(sessions domain.PublishSessionStore) RouteResolver {
	return RouteResolver{sessions: sessions}
}

func (r RouteResolver) Resolve(ctx context.Context, request RouteRequest) (InternalRoute, error) {
	if r.sessions == nil || !opaqueSegment.MatchString(request.DeviceID) || !opaqueSegment.MatchString(request.PublishSession) {
		return InternalRoute{}, ErrRouteUnavailable
	}
	session, err := r.sessions.Find(ctx, request.PublishSession)
	if err != nil {
		return InternalRoute{}, ErrRouteUnavailable
	}
	if !session.ActiveAt(request.Now) {
		return InternalRoute{}, ErrSessionStale
	}
	if session.DeviceUUID != request.DeviceID {
		return InternalRoute{}, ErrDeviceMismatch
	}
	if session.GroupID == "" {
		return InternalRoute{}, ErrRouteUnavailable
	}
	return InternalRoute{
		deviceID: request.DeviceID, groupID: session.GroupID, publishSession: session.SessionID,
		commandTopic: fmt.Sprintf("gcs/device/%s/command", session.SessionID),
	}, nil
}
