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

type Server struct {
	streams      StreamLister
	ice          IceServerProvider
	playback     domain.PlaybackURLBuilder
	authorizer   StreamAuthorizer
	groups       domain.StreamGroupResolver
	publishToken string
	metrics      *Metrics
	gateway      GatewayReadiness
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
		streams:      streams,
		ice:          ice,
		playback:     playback,
		authorizer:   authorizer,
		groups:       groups,
		publishToken: strings.TrimSpace(publishToken),
		metrics:      metrics,
	}
}

func (s Server) WithGatewayReadiness(gateway GatewayReadiness) Server {
	s.gateway = gateway
	return s
}

func (s Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle(routeMetrics, s.metrics.Handler())
	s.handle(mux, routeHealthz, s.healthz)
	s.handle(mux, routeReadyz, s.readyz)
	s.handle(mux, routeRuntimeMetrics, s.runtimeMetrics)
	s.handle(mux, routeMediaMTXAuth, s.mediaMTXAuth)
	s.handle(mux, routeStreams, s.streamList)
	s.handle(mux, routeIceServers, s.iceServers)
	s.handle(mux, routeLegacyStreamStatus, s.legacyStreamStatus)
	s.handle(mux, routeDashboardIceServers, s.dashboardIceServers)
	s.handle(mux, routeDashboardStreamItemPrefix, s.dashboardStreamItem)
	s.handle(mux, routeDashboardStreams, s.dashboardStreamList)
	return mux
}

func (s Server) handle(mux *http.ServeMux, route string, handler http.HandlerFunc) {
	metricRoute := route
	if route == routeDashboardStreamItemPrefix {
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
