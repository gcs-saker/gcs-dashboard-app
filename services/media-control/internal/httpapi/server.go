package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type StreamLister interface {
	ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error)
}

type IceServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type GatewayReadiness interface {
	Ready() (bool, string)
}

type StreamAuthorizer interface {
	AuthorizeStream(
		ctx context.Context,
		authorization string,
		target domain.StreamAccessTarget,
	) (domain.StreamAccessDecision, error)
}

type DevicePublishAuthorizer interface {
	AuthorizeDevicePublish(
		ctx context.Context,
		command domain.DevicePublishCommand,
	) (domain.DevicePublishAuthorization, error)
}

type AccountPublishAuthorizer interface {
	AuthorizeAccountPublish(
		ctx context.Context,
		command domain.AccountPublishCommand,
	) (domain.DevicePublishAuthorization, error)
}

type Server struct {
	streamEndpoints
	publishEndpoints
	operationalEndpoints
}

type streamEndpoints struct {
	streams    StreamLister
	ice        IceServerProvider
	playback   domain.PlaybackURLBuilder
	authorizer StreamAuthorizer
	groups     domain.StreamGroupResolver
}

type publishEndpoints struct {
	devicePublisher  DevicePublishAuthorizer
	accountPublisher AccountPublishAuthorizer
	publishToken     string
	publishSessions  domain.PublishSessionStore
}

type operationalEndpoints struct {
	metrics *Metrics
	gateway GatewayReadiness
	now     func() time.Time
}

func NewServer(
	streams StreamLister,
	ice IceServerProvider,
	playback domain.PlaybackURLBuilder,
	authorizer StreamAuthorizer,
	groups domain.StreamGroupResolver,
	publishToken string,
) Server {
	return NewServerWithMetrics(streams, ice, playback, authorizer, groups, publishToken, NewMetrics())
}

func NewServerWithMetrics(
	streams StreamLister,
	ice IceServerProvider,
	playback domain.PlaybackURLBuilder,
	authorizer StreamAuthorizer,
	groups domain.StreamGroupResolver,
	publishToken string,
	metrics *Metrics,
) Server {
	if metrics == nil {
		metrics = NewMetrics()
	}
	return Server{
		streamEndpoints: streamEndpoints{
			streams: streams, ice: ice, playback: playback, authorizer: authorizer, groups: groups,
		},
		publishEndpoints:     publishEndpoints{publishToken: strings.TrimSpace(publishToken)},
		operationalEndpoints: operationalEndpoints{metrics: metrics, now: time.Now},
	}
}

func (s Server) WithPublishSessionStore(store domain.PublishSessionStore) Server {
	s.publishSessions = store
	return s
}

func (s Server) WithDevicePublishAuthorizer(authorizer DevicePublishAuthorizer) Server {
	s.devicePublisher = authorizer
	return s
}

func (s Server) WithAccountPublishAuthorizer(authorizer AccountPublishAuthorizer) Server {
	s.accountPublisher = authorizer
	return s
}

func (s Server) WithGatewayReadiness(gateway GatewayReadiness) Server {
	s.gateway = gateway
	return s
}

func (s Server) Routes() http.Handler {
	mux := http.NewServeMux()
	s.registerOperationalRoutes(mux)
	s.registerStreamRoutes(mux)
	s.registerPublishRoutes(mux)
	return mux
}

func (s Server) registerOperationalRoutes(mux *http.ServeMux) {
	mux.Handle(routeMetrics, s.metrics.Handler())
	s.handle(mux, routeHealthz, s.healthz)
	s.handle(mux, routeReadyz, s.readyz)
	s.handle(mux, routeRuntimeMetrics, s.runtimeMetrics)
}

func (s Server) registerStreamRoutes(mux *http.ServeMux) {
	s.handle(mux, routeMediaMTXAuth, s.mediaMTXAuth)
	s.handle(mux, routeStreams, s.streamList)
	s.handle(mux, routeIceServers, s.iceServers)
	s.handle(mux, routeLegacyStreamStatus, s.legacyStreamStatus)
	s.handle(mux, routeDashboardIceServers, s.dashboardIceServers)
	s.handle(mux, routeDashboardStreamItemPrefix, s.dashboardStreamItem)
	s.handle(mux, routeDashboardStreams, s.dashboardStreamList)
}

func (s Server) registerPublishRoutes(mux *http.ServeMux) {
	s.handle(mux, routeDevicePublishSessions, s.devicePublishSessions)
	s.handle(mux, routeDevicePublishSessionPrefix, s.devicePublishSessions)
	s.handle(mux, routeAccountPublishSessions, s.accountPublishSessions)
	s.handle(mux, routeAccountPublishSessionPrefix, s.accountPublishSessions)
}

func (s Server) handle(mux *http.ServeMux, route string, handler http.HandlerFunc) {
	metricRoute := route
	if route == routeDashboardStreamItemPrefix || route == routeDevicePublishSessionPrefix {
		metricRoute = routeDashboardStreamItemMetric
	}
	mux.Handle(
		route,
		otelhttp.NewHandler(
			http.HandlerFunc(s.instrument(metricRoute, handler)),
			metricRoute,
		),
	)
}

func (s Server) instrument(route string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recorder := &statusRecordingWriter{ResponseWriter: w, status: http.StatusOK}
		if traceID := observability.TraceIDFromContext(r.Context()); traceID != "" {
			recorder.Header().Set(traceIDHeader, traceID)
		}
		started := time.Now()
		handler(recorder, r)
		s.metrics.ObserveHTTP(route, r.Method, recorder.status, time.Since(started))
	}
}
