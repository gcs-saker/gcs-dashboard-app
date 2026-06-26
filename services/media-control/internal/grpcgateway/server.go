package grpcgateway

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	serviceName                    = "gcs.saker.v1.SakerGatewayService"
	methodExchange                 = "Exchange"
	fullMethodExchange             = "/gcs.saker.v1.SakerGatewayService/Exchange"
	metadataAuthorization          = "authorization"
	metadataGatewayToken           = "x-gcs-gateway-token"
	metadataReconnect              = "x-gcs-gateway-reconnect"
	bearerPrefix                   = "bearer "
	defaultMaxPayloadBytes         = 64 * 1024
	gatewayFieldRequestID          = 1
	gatewayFieldOrgID              = 2
	gatewayFieldGroupID            = 3
	gatewayFieldAssetID            = 4
	gatewayFieldTelemetry          = 10
	gatewayFieldStreamEvent        = 11
	gatewayFieldCommandAck         = 12
	responseFieldResponseID        = 1
	responseFieldRequestID         = 2
	responseFieldStatus            = 3
	responseFieldReasonCode        = 4
	ackAccepted             uint64 = 1
	ackRejected             uint64 = 2
	ackBackpressure         uint64 = 3
	ackReconnect            uint64 = 4
	reasonAccepted                 = "accepted"
	reasonMalformed                = "malformed_protobuf"
	reasonUnauthorized             = "unauthorized_gateway_metadata"
	reasonBackpressure             = "payload_too_large"
	reasonReconnect                = "reconnect_requested"
)

type Server struct {
	token           string
	maxPayloadBytes int
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
		return gatewayResponse("", ackBackpressure, reasonBackpressure)
	}
	fields, err := decodeLengthDelimitedFields(request)
	if err != nil {
		return gatewayResponse("", ackRejected, reasonMalformed)
	}
	requestID, err := readString(fields, gatewayFieldRequestID)
	if err != nil {
		return gatewayResponse("", ackRejected, reasonMalformed)
	}
	if _, err := readString(fields, gatewayFieldOrgID); err != nil {
		return gatewayResponse(requestID, ackRejected, reasonMalformed)
	}
	if _, err := readString(fields, gatewayFieldGroupID); err != nil {
		return gatewayResponse(requestID, ackRejected, reasonMalformed)
	}
	if _, err := readString(fields, gatewayFieldAssetID); err != nil {
		return gatewayResponse(requestID, ackRejected, reasonMalformed)
	}
	if !hasAnyField(fields, gatewayFieldTelemetry, gatewayFieldStreamEvent, gatewayFieldCommandAck) {
		return gatewayResponse(requestID, ackRejected, reasonMalformed)
	}
	if reconnectRequested {
		return gatewayResponse(requestID, ackReconnect, reasonReconnect)
	}
	return gatewayResponse(requestID, ackAccepted, reasonAccepted)
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

func gatewayResponse(requestID string, status uint64, reasonCode string) []byte {
	response := make([]byte, 0, 64)
	response = encodeString(response, responseFieldResponseID, fmt.Sprintf("grpc-%s", reasonCode))
	if requestID != "" {
		response = encodeString(response, responseFieldRequestID, requestID)
	}
	response = encodeVarintField(response, responseFieldStatus, status)
	response = encodeString(response, responseFieldReasonCode, reasonCode)
	return response
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
	server := NewServer(token, maxPayloadBytes)
	go func() {
		if err := server.Serve(ctx, listenAddress); err != nil {
			log.Printf("gRPC gateway stopped: %v", err)
		}
	}()
}
