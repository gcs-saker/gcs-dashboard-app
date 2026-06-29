package grpcgateway

import (
	"context"
	"errors"
	"io"
	"log"
	"net"
	"strings"
	"sync"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	serviceName            = "gcs.saker.v1.SakerGatewayService"
	methodExchange         = "Exchange"
	fullMethodExchange     = "/gcs.saker.v1.SakerGatewayService/Exchange"
	metadataAuthorization  = "authorization"
	metadataGatewayToken   = "x-gcs-gateway-token"
	metadataReconnect      = "x-gcs-gateway-reconnect"
	bearerPrefix           = "bearer "
	defaultMaxPayloadBytes = 64 * 1024
	reasonAccepted         = "accepted"
	reasonMalformed        = "malformed_protobuf"
	reasonUnauthorized     = "unauthorized_gateway_metadata"
	reasonBackpressure     = "payload_too_large"
	reasonReconnect        = "reconnect_requested"
)

type Server struct {
	token           string
	maxPayloadBytes int
}

type Readiness struct {
	mu      sync.RWMutex
	enabled bool
	ready   bool
	reason  string
}

func NewServer(token string, maxPayloadBytes int) Server {
	if maxPayloadBytes <= 0 {
		maxPayloadBytes = defaultMaxPayloadBytes
	}
	return Server{
		token:           strings.TrimSpace(token),
		maxPayloadBytes: maxPayloadBytes,
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

func (s Server) Register(server *grpc.Server) {
	server.RegisterService(&grpc.ServiceDesc{
		ServiceName: serviceName,
		HandlerType: (*gatewayExchangeServer)(nil),
		Streams: []grpc.StreamDesc{
			{
				StreamName:    methodExchange,
				Handler:       s.exchangeHandler,
				ServerStreams: true,
				ClientStreams: true,
			},
		},
		Metadata: "gcs/saker/v1/gateway_service.proto",
	}, &gatewayExchangeService{})
}

func (s Server) exchangeHandler(_ any, stream grpc.ServerStream) error {
	if !s.authorized(stream.Context()) {
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
		response := s.handleRequest(request, reconnectRequested)
		if err := stream.SendMsg(response); err != nil {
			return err
		}
	}
}

func (s Server) handleRequest(request []byte, reconnectRequested bool) []byte {
	if len(request) > s.maxPayloadBytes {
		return GatewayResponse("", GatewayAckStatusBackpressure, reasonBackpressure)
	}
	gatewayRequest, err := DecodeGatewayStreamRequest(request)
	if err != nil {
		return GatewayResponse("", GatewayAckStatusRejected, reasonMalformed)
	}
	if reconnectRequested {
		return GatewayResponse(gatewayRequest.RequestID, GatewayAckStatusReconnect, reasonReconnect)
	}
	return GatewayResponse(gatewayRequest.RequestID, GatewayAckStatusAccepted, reasonAccepted)
}

func (s Server) authorized(ctx context.Context) bool {
	if s.token == "" {
		return false
	}
	if metadataContains(ctx, metadataGatewayToken, s.token) {
		return true
	}
	for _, value := range metadataValues(ctx, metadataAuthorization) {
		if strings.EqualFold(strings.TrimSpace(value), bearerPrefix+s.token) {
			return true
		}
	}
	return false
}

func metadataContains(ctx context.Context, key string, expected string) bool {
	for _, value := range metadataValues(ctx, key) {
		if strings.TrimSpace(value) == expected {
			return true
		}
	}
	return false
}

func metadataValues(ctx context.Context, key string) []string {
	incoming, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil
	}
	return incoming.Get(key)
}

type gatewayExchangeServer interface{}

type gatewayExchangeService struct{}

func Start(ctx context.Context, listenAddress string, token string, maxPayloadBytes int) {
	state := StartWithReadiness(ctx, listenAddress, token, maxPayloadBytes)
	_ = state
}

func StartWithReadiness(ctx context.Context, listenAddress string, token string, maxPayloadBytes int) *Readiness {
	state := &Readiness{
		enabled: strings.TrimSpace(listenAddress) != "",
		reason:  "starting",
	}
	server := NewServer(token, maxPayloadBytes)
	go func() {
		if !state.enabled {
			state.markReady()
			return
		}
		if err := server.serve(ctx, listenAddress, state.markReady); err != nil {
			state.markFailed(grpcFailureReason(err))
			log.Printf("gRPC gateway stopped: %v", err)
		}
	}()
	return state
}

func grpcFailureReason(err error) string {
	var netError *net.OpError
	if errors.As(err, &netError) && netError.Op == "listen" {
		return "listen_failed"
	}
	return "serve_failed"
}

func (r *Readiness) Ready() (bool, string) {
	if r == nil {
		return true, ""
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ready, r.reason
}

func (r *Readiness) markReady() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready = true
	r.reason = ""
}

func (r *Readiness) markFailed(reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready = false
	r.reason = reason
}
