package grpcgateway

import (
	"context"
	"net"
	"testing"
	"time"

	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"google.golang.org/protobuf/proto"
)

const testGatewayToken = "test-gateway-token"

func TestExchangeNeverAcceptsWithoutDurableHandler(t *testing.T) {
	response, err := exchangeOnce(t, gatewayRequest("req-001", true), testGatewayToken, nil)

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "req-001", GatewayAckStatusBackpressure, reasonStoreFailed)
}

func TestExchangeRejectsUnauthorizedMetadata(t *testing.T) {
	_, err := exchangeOnce(t, gatewayRequest("req-unauthorized", true), "wrong-token", nil)

	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected unauthenticated error, got %v", err)
	}
}

func TestExchangeRejectsMissingGatewayMetadata(t *testing.T) {
	_, err := exchangeOnceWithMetadata(t, gatewayRequest("req-missing-auth", true), metadata.MD{}, nil)

	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected unauthenticated error, got %v", err)
	}
}

func TestExchangeReturnsMalformedStatusForInvalidPayload(t *testing.T) {
	response, err := exchangeOnce(t, []byte{0xff}, testGatewayToken, nil)

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "", GatewayAckStatusRejected, reasonMalformed)
}

func TestExchangeReturnsBackpressureForOversizedPayload(t *testing.T) {
	response, err := exchangeOnce(t, append(gatewayRequest("req-large", true), make([]byte, 128)...), testGatewayToken, func(server Server) Server {
		server.maxPayloadBytes = 16
		return server
	})

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "", GatewayAckStatusBackpressure, reasonBackpressure)
}

func TestExchangeCanAskGatewayToReconnect(t *testing.T) {
	response, err := exchangeOnce(t, gatewayRequest("req-reconnect", true), testGatewayToken, func(server Server) Server {
		return server
	}, metadata.Pairs(metadataReconnect, "true"))

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "req-reconnect", GatewayAckStatusReconnect, reasonReconnect)
}

func TestExchangeKeepsOneBidiStreamForMultipleGatewayMessages(t *testing.T) {
	responses, err := exchangeMany(t, []string{"req-001", "req-002", "req-003"}, testGatewayToken)

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	if len(responses) != 3 {
		t.Fatalf("response count mismatch: got %d", len(responses))
	}
	for index, response := range responses {
		assertResponse(t, response, []string{"req-001", "req-002", "req-003"}[index], GatewayAckStatusBackpressure, reasonStoreFailed)
	}
}

func TestExchangeRoutesPlannedGatewayPayloadsToHandler(t *testing.T) {
	payloadKinds := []GatewayPayloadKind{
		GatewayPayloadTelemetry,
		GatewayPayloadStream,
		GatewayPayloadCommandAck,
	}
	for _, payloadKind := range payloadKinds {
		t.Run(string(payloadKind), func(t *testing.T) {
			handler := &recordingGatewayHandler{}

			response, err := exchangeOnce(t, gatewayRequestOfKind("req-"+string(payloadKind), payloadKind), testGatewayToken, func(server Server) Server {
				server.handler = handler
				return server
			})

			if err != nil {
				t.Fatalf("exchange failed: %v", err)
			}
			assertResponse(t, response, "req-"+string(payloadKind), GatewayAckStatusAccepted, reasonAccepted)
			if len(handler.requests) != 1 {
				t.Fatalf("handler request count mismatch: got %d", len(handler.requests))
			}
			if handler.requests[0].Payload.Kind != payloadKind {
				t.Fatalf("handler payload kind mismatch: got %q want %q", handler.requests[0].Payload.Kind, payloadKind)
			}
			if len(handler.requests[0].Payload.Value) != 0 {
				t.Fatalf("expected canonical empty protobuf payload, got %q", handler.requests[0].Payload.Value)
			}
		})
	}
}

func TestExchangeReturnsGatewayHandlerDecision(t *testing.T) {
	handler := &recordingGatewayHandler{
		decision: GatewayRequestDecision{
			Status:     GatewayAckStatusRejected,
			ReasonCode: "policy_rejected",
		},
	}

	response, err := exchangeOnce(t, gatewayRequest("req-rejected", true), testGatewayToken, func(server Server) Server {
		server.handler = handler
		return server
	})

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "req-rejected", GatewayAckStatusRejected, "policy_rejected")
}

func TestExchangeEnforcesAuthenticatedDeviceGroupEndToEnd(t *testing.T) {
	store := &recordingTelemetryStore{}
	message := &sakerv1.GatewayStreamRequest{
		RequestId: "request-1", GroupId: "co-b", AssetId: "device-1",
		Payload: &sakerv1.GatewayStreamRequest_Telemetry{Telemetry: &sakerv1.TelemetryEnvelope{
			EventId: "event-1", AssetId: "device-1",
			Time: &sakerv1.Timestamped{ObservedUnixMillis: 1_722_067_200_000},
			Position: &sakerv1.GeoPoint{Latitude: 35.8714, Longitude: 128.6014},
		}},
	}
	wire, err := proto.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	response, err := exchangeOnceWithMetadata(
		t,
		wire,
		metadata.Pairs(metadataDeviceUUID, "device-1", metadataDeviceCredential, "credential"),
		func(server Server) Server {
			server.authenticator = staticGatewayAuthenticator{identity: GatewayIdentity{DeviceUUID: "device-1", GroupID: "co-a"}}
			server.handler = NewTelemetryHandler(store)
			return server
		},
	)
	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "request-1", GatewayAckStatusRejected, reasonIdentityMismatch)
	if store.calls != 0 {
		t.Fatalf("identity mismatch reached telemetry store: calls=%d", store.calls)
	}
}

func TestStartWithReadinessReportsListeningState(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve port: %v", err)
	}
	address := listener.Addr().String()
	_ = listener.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	readiness := StartWithReadiness(ctx, address, testGatewayToken, defaultMaxPayloadBytes)

	assertReadinessEventually(t, readiness, true, "")
}

func TestStartWithReadinessReportsServeFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve port: %v", err)
	}
	defer listener.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	readiness := StartWithReadiness(ctx, listener.Addr().String(), testGatewayToken, defaultMaxPayloadBytes)

	assertReadinessEventually(t, readiness, false, "listen_failed")
}

func exchangeOnce(
	t *testing.T,
	request []byte,
	token string,
	mutate func(Server) Server,
	extraMetadata ...metadata.MD,
) ([]byte, error) {
	t.Helper()
	gatewayMetadata := metadata.Pairs(metadataGatewayToken, token)
	for _, item := range extraMetadata {
		gatewayMetadata = metadata.Join(gatewayMetadata, item)
	}
	return exchangeOnceWithMetadata(t, request, gatewayMetadata, mutate)
}

func exchangeOnceWithMetadata(
	t *testing.T,
	request []byte,
	gatewayMetadata metadata.MD,
	mutate func(Server) Server,
) ([]byte, error) {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	grpcServer := grpc.NewServer()
	server := NewServer(testGatewayToken, defaultMaxPayloadBytes)
	if mutate != nil {
		server = mutate(server)
	}
	server.Register(grpcServer)
	go func() {
		_ = grpcServer.Serve(listener)
	}()
	defer grpcServer.Stop()

	ctx := metadata.NewOutgoingContext(
		context.Background(),
		gatewayMetadata,
	)
	conn, err := grpc.DialContext(
		ctx,
		"bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.ForceCodec(rawBytesCodec{})),
	)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{ServerStreams: true, ClientStreams: true}, fullMethodExchange)
	if err != nil {
		return nil, err
	}
	if err := stream.SendMsg(request); err != nil {
		return nil, err
	}
	if err := stream.CloseSend(); err != nil {
		return nil, err
	}
	var response []byte
	if err := stream.RecvMsg(&response); err != nil {
		return nil, err
	}
	return response, nil
}

func gatewayRequest(requestID string, includePayload bool) []byte {
	if includePayload {
		return gatewayRequestOfKind(requestID, GatewayPayloadTelemetry)
	}
	wire, err := proto.Marshal(&sakerv1.GatewayStreamRequest{RequestId: requestID, OrgId: "a4ai", GroupId: "co-a", AssetId: "raw.mobile.front"})
	if err != nil {
		panic(err)
	}
	return wire
}

func gatewayRequestOfKind(requestID string, payloadKind GatewayPayloadKind) []byte {
	message := &sakerv1.GatewayStreamRequest{
		RequestId: requestID, OrgId: "a4ai", GroupId: "co-a", AssetId: "raw.mobile.front",
	}
	switch payloadKind {
	case GatewayPayloadTelemetry:
		message.Payload = &sakerv1.GatewayStreamRequest_Telemetry{Telemetry: &sakerv1.TelemetryEnvelope{}}
	case GatewayPayloadStream:
		message.Payload = &sakerv1.GatewayStreamRequest_StreamEvent{StreamEvent: &sakerv1.StreamSessionEvent{}}
	case GatewayPayloadCommandAck:
		message.Payload = &sakerv1.GatewayStreamRequest_CommandAck{CommandAck: &sakerv1.CommandAck{}}
	default:
		panic("unsupported test gateway request payload kind")
	}
	wire, err := proto.Marshal(message)
	if err != nil {
		panic(err)
	}
	return wire
}

func assertResponse(t *testing.T, payload []byte, requestID string, expectedStatus GatewayAckStatus, reasonCode string) {
	t.Helper()
	response := &sakerv1.GatewayStreamResponse{}
	if err := proto.Unmarshal(payload, response); err != nil {
		t.Fatal(err)
	}
	if requestID != "" && response.GetRequestId() != requestID {
		t.Fatalf("request id mismatch: %q", response.GetRequestId())
	}
	if response.GetStatus() != expectedStatus {
		t.Fatalf("status mismatch: got %d want %d", response.GetStatus(), expectedStatus)
	}
	if response.GetReasonCode() != reasonCode {
		t.Fatalf("reason mismatch: got %q want %q", response.GetReasonCode(), reasonCode)
	}
	if response.GetResponseId() == "" {
		t.Fatal("response id is required")
	}
}

func exchangeMany(t *testing.T, requestIDs []string, token string) ([][]byte, error) {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	grpcServer := grpc.NewServer()
	NewServer(testGatewayToken, defaultMaxPayloadBytes).Register(grpcServer)
	go func() {
		_ = grpcServer.Serve(listener)
	}()
	defer grpcServer.Stop()

	ctx := metadata.NewOutgoingContext(
		context.Background(),
		metadata.Pairs(metadataGatewayToken, token),
	)
	conn, err := grpc.DialContext(
		ctx,
		"bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.ForceCodec(rawBytesCodec{})),
	)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{ServerStreams: true, ClientStreams: true}, fullMethodExchange)
	if err != nil {
		return nil, err
	}
	for _, requestID := range requestIDs {
		if err := stream.SendMsg(gatewayRequest(requestID, true)); err != nil {
			return nil, err
		}
	}
	if err := stream.CloseSend(); err != nil {
		return nil, err
	}

	responses := make([][]byte, 0, len(requestIDs))
	for range requestIDs {
		var response []byte
		if err := stream.RecvMsg(&response); err != nil {
			return nil, err
		}
		responses = append(responses, response)
	}
	return responses, nil
}

type recordingGatewayHandler struct {
	requests []GatewayStreamRequest
	decision GatewayRequestDecision
}

type staticGatewayAuthenticator struct {
	identity GatewayIdentity
}

func (a staticGatewayAuthenticator) AuthenticateGateway(context.Context, GatewayCredentials) (GatewayIdentity, error) {
	return a.identity, nil
}

func (h *recordingGatewayHandler) HandleGatewayRequest(_ context.Context, request GatewayStreamRequest) GatewayRequestDecision {
	h.requests = append(h.requests, request)
	if h.decision.Status != 0 {
		return h.decision
	}
	return GatewayRequestDecision{
		Status:     GatewayAckStatusAccepted,
		ReasonCode: reasonAccepted,
	}
}

func assertReadinessEventually(t *testing.T, readiness *Readiness, expectedReady bool, expectedReason string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		ready, reason := readiness.Ready()
		if ready == expectedReady && reason == expectedReason {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	ready, reason := readiness.Ready()
	t.Fatalf("readiness mismatch: ready=%v reason=%q", ready, reason)
}
