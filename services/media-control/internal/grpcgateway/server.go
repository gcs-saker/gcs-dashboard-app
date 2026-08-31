package grpcgateway

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
)

const (
	defaultMaxPayloadBytes = 64 * 1024
	reasonUnauthorized     = "unauthorized_gateway_metadata"
	gracefulStopTimeout    = 5 * time.Second
)

type Server struct {
	token           string
	maxPayloadBytes int
	handler         GatewayRequestHandler
	authenticator   GatewayAuthenticator
	metrics         GatewayMetrics
}

type GatewayMetrics interface {
	ObserveGateway(status string, reason string, elapsed time.Duration)
}

func NewDeviceServer(authenticator GatewayAuthenticator, maxPayloadBytes int, handler GatewayRequestHandler) Server {
	server := NewServerWithHandler("", maxPayloadBytes, handler)
	server.authenticator = authenticator
	return server
}

func (s Server) WithMetrics(metrics GatewayMetrics) Server {
	s.metrics = metrics
	return s
}

func NewServer(token string, maxPayloadBytes int) Server {
	return NewServerWithHandler(token, maxPayloadBytes, nil)
}

func NewServerWithHandler(token string, maxPayloadBytes int, handler GatewayRequestHandler) Server {
	if maxPayloadBytes <= 0 {
		maxPayloadBytes = defaultMaxPayloadBytes
	}
	if handler == nil {
		handler = GatewayRequestHandlerFunc(acceptGatewayRequest)
	}
	return Server{
		token:           strings.TrimSpace(token),
		maxPayloadBytes: maxPayloadBytes,
		handler:         handler,
	}
}

func (s Server) Serve(ctx context.Context, listenAddress string) error {
	return s.serve(ctx, listenAddress, nil)
}

func (s Server) serve(ctx context.Context, listenAddress string, onReady func()) error {
	if strings.TrimSpace(listenAddress) == "" {
		return nil
	}
	listener, err := net.Listen("tcp", listenAddress)
	if err != nil {
		return err
	}
	server := grpc.NewServer()
	s.Register(server)
	go stopServerWhenCancelled(ctx, server)
	if onReady != nil {
		onReady()
	}
	err = server.Serve(listener)
	if errors.Is(err, grpc.ErrServerStopped) {
		return nil
	}
	return err
}

func stopServerWhenCancelled(ctx context.Context, server *grpc.Server) {
	<-ctx.Done()
	stopped := make(chan struct{})
	go func() {
		server.GracefulStop()
		close(stopped)
	}()
	timer := time.NewTimer(gracefulStopTimeout)
	defer timer.Stop()
	select {
	case <-stopped:
	case <-timer.C:
		server.Stop()
	}
}

func (s Server) exchangeHandler(_ any, stream grpc.ServerStream) error {
	credentials, err := s.exchangeCredentials(stream.Context())
	if err != nil {
		return err
	}
	reconnectRequested := metadataContains(stream.Context(), metadataReconnect, "true")
	for {
		var request []byte
		err := stream.RecvMsg(&request)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		requestContext, err := s.authenticatedRequestContext(stream.Context(), credentials)
		if err != nil {
			return err
		}
		response := s.handleRequest(requestContext, request, reconnectRequested)
		if err := stream.SendMsg(response); err != nil {
			return err
		}
	}
}

func (s Server) exchangeCredentials(ctx context.Context) (GatewayCredentials, error) {
	credentials, credentialError := gatewayCredentials(ctx)
	legacyRejected := s.authenticator == nil && !s.authorized(ctx)
	credentialRejected := s.authenticator != nil && credentialError != nil
	if legacyRejected || credentialRejected {
		logGatewaySecurity(ctx, "authentication_rejected", reasonUnauthorized, 0)
		return GatewayCredentials{}, status.Error(codes.Unauthenticated, reasonUnauthorized)
	}
	return credentials, nil
}

func (s Server) authenticatedRequestContext(ctx context.Context, credentials GatewayCredentials) (context.Context, error) {
	if s.authenticator == nil {
		return ctx, nil
	}
	identity, err := s.authenticator.AuthenticateGateway(ctx, credentials)
	if err != nil {
		logGatewaySecurity(ctx, "authentication_rejected", reasonUnauthorized, 0)
		return nil, status.Error(codes.Unauthenticated, reasonUnauthorized)
	}
	ctx = context.WithValue(ctx, gatewayIdentityContextKey{}, identity)
	return context.WithValue(ctx, gatewayCredentialsContextKey{}, credentials), nil
}

func logGatewaySecurity(ctx context.Context, event string, reason string, payloadBytes int) {
	traceID := observability.TraceIDFromContext(ctx)
	slog.Warn(
		"grpc_gateway_security", "event", event, "reason", reason, "method", fullMethodExchange,
		"traceId", traceID, "peerSource", "trusted_edge_required", "payloadBytes", payloadBytes,
	)
}

func (s Server) handleRequest(ctx context.Context, request []byte, reconnectRequested bool) []byte {
	started := time.Now()
	if len(request) > s.maxPayloadBytes {
		s.observeGateway(GatewayAckStatusBackpressure, reasonBackpressure, started)
		logGatewaySecurity(ctx, "message_rejected", reasonBackpressure, len(request))
		return GatewayResponse("", GatewayAckStatusBackpressure, reasonBackpressure)
	}
	gatewayRequest, err := DecodeGatewayStreamRequest(request)
	if err != nil {
		s.observeGateway(GatewayAckStatusRejected, reasonMalformed, started)
		logGatewaySecurity(ctx, "message_rejected", reasonMalformed, len(request))
		return GatewayResponse("", GatewayAckStatusRejected, reasonMalformed)
	}
	if reconnectRequested {
		s.observeGateway(GatewayAckStatusReconnect, reasonReconnect, started)
		return GatewayResponse(gatewayRequest.RequestID, GatewayAckStatusReconnect, reasonReconnect)
	}
	decision := s.handler.HandleGatewayRequest(ctx, gatewayRequest)
	s.observeGateway(decision.Status, decision.ReasonCode, started)
	if decision.Status != GatewayAckStatusAccepted {
		logGatewaySecurity(ctx, "message_rejected", decision.ReasonCode, len(request))
	}
	return gatewayDecisionResponse(gatewayRequest.RequestID, decision)
}

func (s Server) observeGateway(status GatewayAckStatus, reason string, started time.Time) {
	if s.metrics != nil {
		s.metrics.ObserveGateway(status.String(), gatewayMetricReason(reason), time.Since(started))
	}
}

func gatewayMetricReason(reason string) string {
	switch reason {
	case reasonAccepted, reasonMalformed, reasonSemanticInvalid, reasonBackpressure,
		reasonReconnect, reasonStoreFailed, reasonIdentityMismatch, reasonUnauthorized:
		return reason
	default:
		return "other"
	}
}

func Start(ctx context.Context, listenAddress string, token string, maxPayloadBytes int) {
	StartWithReadiness(ctx, listenAddress, token, maxPayloadBytes)
}
