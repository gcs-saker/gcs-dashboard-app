package grpcgateway

import (
	"context"
	"fmt"
)

const (
	reasonAccepted     = "accepted"
	reasonMalformed    = "malformed_protobuf"
	reasonBackpressure = "payload_too_large"
	reasonReconnect    = "reconnect_requested"
)

type GatewayRequestDecision struct {
	Status     GatewayAckStatus
	ReasonCode string
	Payload    *GatewayStreamRequestPayload
}

type GatewayRequestHandler interface {
	HandleGatewayRequest(context.Context, GatewayStreamRequest) GatewayRequestDecision
}

type GatewayRequestHandlerFunc func(context.Context, GatewayStreamRequest) GatewayRequestDecision

func (f GatewayRequestHandlerFunc) HandleGatewayRequest(ctx context.Context, request GatewayStreamRequest) GatewayRequestDecision {
	return f(ctx, request)
}

func acceptGatewayRequest(context.Context, GatewayStreamRequest) GatewayRequestDecision {
	return GatewayRequestDecision{
		Status:     GatewayAckStatusAccepted,
		ReasonCode: reasonAccepted,
	}
}

func normalizedDecision(decision GatewayRequestDecision) GatewayRequestDecision {
	if decision.Status == 0 {
		decision.Status = GatewayAckStatusAccepted
	}
	if decision.ReasonCode == "" {
		decision.ReasonCode = reasonAccepted
	}
	return decision
}

func gatewayDecisionResponse(requestID string, decision GatewayRequestDecision) []byte {
	decision = normalizedDecision(decision)
	return GatewayStreamResponse{
		ResponseID: fmt.Sprintf("grpc-%s", decision.ReasonCode),
		RequestID:  requestID,
		Status:     decision.Status,
		ReasonCode: decision.ReasonCode,
		Payload:    decision.Payload,
	}.ToWire()
}
