package grpcgateway

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/peer"
)

const (
	defaultMaxPayloadBytes = 64 * 1024
	reasonUnauthorized     = "unauthorized_gateway_metadata"
)

type Server struct {
	token           string
	maxPayloadBytes int
	handler         GatewayRequestHandler
	authenticator   GatewayAuthenticator
}

func NewDeviceServer(authenticator GatewayAuthenticator, maxPayloadBytes int, handler GatewayRequestHandler) Server {
	server := NewServerWithHandler("", maxPayloadBytes, handler)
	server.authenticator = authenticator
	return server
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
	go func() {
		<-ctx.Done()
		server.GracefulStop()
	}()
	if onReady != nil {
		onReady()
	}
	err = server.Serve(listener)
	if errors.Is(err, grpc.ErrServerStopped) {
		return nil
	}
	return err
}

func (s Server) exchangeHandler(_ any, stream grpc.ServerStream) error {
	credentials, credentialError := gatewayCredentials(stream.Context())
	if s.authenticator == nil && !s.authorized(stream.Context()) {
		logGatewaySecurity(stream.Context(), "authentication_rejected", reasonUnauthorized, 0)
		return status.Error(codes.Unauthenticated, reasonUnauthorized)
	}
	if s.authenticator != nil && credentialError != nil {
		logGatewaySecurity(stream.Context(), "authentication_rejected", reasonUnauthorized, 0)
		return status.Error(codes.Unauthenticated, reasonUnauthorized)
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
		requestContext := stream.Context()
		if s.authenticator != nil {
			identity, err := s.authenticator.AuthenticateGateway(requestContext, credentials)
			if err != nil {
				logGatewaySecurity(requestContext, "authentication_rejected", reasonUnauthorized, 0)
				return status.Error(codes.Unauthenticated, reasonUnauthorized)
			}
			requestContext = context.WithValue(requestContext, gatewayIdentityContextKey{}, identity)
			requestContext = context.WithValue(requestContext, gatewayCredentialsContextKey{}, credentials)
		}
		response := s.handleRequest(requestContext, request, reconnectRequested)
		if err := stream.SendMsg(response); err != nil {
			return err
		}
	}
}

func logGatewaySecurity(ctx context.Context, event string, reason string, payloadBytes int) {
	remote := "-"
	if remotePeer, ok := peer.FromContext(ctx); ok && remotePeer.Addr != nil {
		remote = remotePeer.Addr.String()
	}
	slog.Warn("grpc_gateway_security", "event", event, "reason", reason, "method", fullMethodExchange, "remote", remote, "payloadBytes", payloadBytes)
}

func (s Server) handleRequest(ctx context.Context, request []byte, reconnectRequested bool) []byte {
	if len(request) > s.maxPayloadBytes {
		logGatewaySecurity(ctx, "message_rejected", reasonBackpressure, len(request))
		return GatewayResponse("", GatewayAckStatusBackpressure, reasonBackpressure)
	}
	gatewayRequest, err := DecodeGatewayStreamRequest(request)
	if err != nil {
		logGatewaySecurity(ctx, "message_rejected", reasonMalformed, len(request))
		return GatewayResponse("", GatewayAckStatusRejected, reasonMalformed)
	}
	if reconnectRequested {
		return GatewayResponse(gatewayRequest.RequestID, GatewayAckStatusReconnect, reasonReconnect)
	}
	decision := s.handler.HandleGatewayRequest(ctx, gatewayRequest)
	if decision.Status != GatewayAckStatusAccepted {
		logGatewaySecurity(ctx, "message_rejected", decision.ReasonCode, len(request))
	}
	return gatewayDecisionResponse(gatewayRequest.RequestID, decision)
}

func Start(ctx context.Context, listenAddress string, token string, maxPayloadBytes int) {
	state := StartWithReadiness(ctx, listenAddress, token, maxPayloadBytes)
	_ = state
}
