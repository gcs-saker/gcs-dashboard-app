package grpcgateway

import (
	"context"
	"net"
	"strings"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const testGatewayToken = "test-gateway-token"

func TestExchangeAcceptsAuthorizedGatewayRequest(t *testing.T) {
	response, err := exchangeOnce(t, gatewayRequest("req-001", true), testGatewayToken, nil)

	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	assertResponse(t, response, "req-001", GatewayAckStatusAccepted, reasonAccepted)
}

func TestExchangeRejectsUnauthorizedMetadata(t *testing.T) {
	_, err := exchangeOnce(t, gatewayRequest("req-unauthorized", true), "wrong-token", nil)

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
		assertResponse(t, response, []string{"req-001", "req-002", "req-003"}[index], GatewayAckStatusAccepted, reasonAccepted)
	}
}

func exchangeOnce(
	t *testing.T,
	request []byte,
	token string,
	mutate func(Server) Server,
	extraMetadata ...metadata.MD,
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
		metadata.Pairs(metadataGatewayToken, token),
	)
	for _, item := range extraMetadata {
		ctx = metadata.NewOutgoingContext(ctx, metadata.Join(metadata.Pairs(metadataGatewayToken, token), item))
	}
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
	payload := make([]byte, 0, 96)
	payload = encodeString(payload, requestFieldRequestID, requestID)
	payload = encodeString(payload, requestFieldOrgID, "a4ai")
	payload = encodeString(payload, requestFieldGroupID, "co-a")
	payload = encodeString(payload, requestFieldAssetID, "raw.mobile.front")
	if includePayload {
		payload = encodeString(payload, requestFieldTelemetry, "telemetry-bytes")
	}
	return payload
}

func assertResponse(t *testing.T, payload []byte, requestID string, expectedStatus GatewayAckStatus, reasonCode string) {
	t.Helper()
	fields := decodeResponse(t, payload)
	if requestID != "" && string(fields.strings[responseFieldRequestID]) != requestID {
		t.Fatalf("request id mismatch: %q", fields.strings[responseFieldRequestID])
	}
	if GatewayAckStatus(fields.varints[responseFieldStatus]) != expectedStatus {
		t.Fatalf("status mismatch: got %d want %d", fields.varints[responseFieldStatus], expectedStatus)
	}
	if string(fields.strings[responseFieldReasonCode]) != reasonCode {
		t.Fatalf("reason mismatch: got %q want %q", fields.strings[responseFieldReasonCode], reasonCode)
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

type decodedResponse struct {
	strings map[int][]byte
	varints map[int]uint64
}

func decodeResponse(t *testing.T, payload []byte) decodedResponse {
	t.Helper()
	result := decodedResponse{strings: map[int][]byte{}, varints: map[int]uint64{}}
	cursor := 0
	for cursor < len(payload) {
		key, next, err := readVarint(payload, cursor)
		if err != nil {
			t.Fatalf("read key failed: %v", err)
		}
		cursor = next
		fieldNumber := int(key >> 3)
		wireType := int(key & 0b111)
		switch wireType {
		case wireTypeVarint:
			value, next, err := readVarint(payload, cursor)
			if err != nil {
				t.Fatalf("read varint failed: %v", err)
			}
			result.varints[fieldNumber] = value
			cursor = next
		case wireTypeLengthDelimited:
			length, next, err := readVarint(payload, cursor)
			if err != nil {
				t.Fatalf("read length failed: %v", err)
			}
			cursor = next
			end := cursor + int(length)
			if end > len(payload) {
				t.Fatal("response length exceeds payload")
			}
			result.strings[fieldNumber] = append([]byte(nil), payload[cursor:end]...)
			cursor = end
		default:
			t.Fatalf("unsupported wire type %d", wireType)
		}
	}
	if !strings.HasPrefix(string(result.strings[responseFieldResponseID]), "grpc-") {
		t.Fatalf("response id is not generated by grpc gateway: %q", result.strings[responseFieldResponseID])
	}
	return result
}
