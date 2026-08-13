package grpcgateway

import (
	"fmt"

	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

func DecodeGatewayStreamRequest(payload []byte) (GatewayStreamRequest, error) {
	message := &sakerv1.GatewayStreamRequest{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return GatewayStreamRequest{}, err
	}
	requestPayload, err := generatedRequestPayload(message)
	if err != nil {
		return GatewayStreamRequest{}, err
	}
	if message.GetRequestId() == "" || message.GetOrgId() == "" || message.GetGroupId() == "" || message.GetAssetId() == "" {
		return GatewayStreamRequest{}, fmt.Errorf("gateway request identity fields are required")
	}
	return GatewayStreamRequest{
		RequestID: message.GetRequestId(), OrgID: message.GetOrgId(), GroupID: message.GetGroupId(),
		AssetID: message.GetAssetId(), Payload: requestPayload,
	}, nil
}

func (r GatewayStreamResponse) ToWire() []byte {
	message := &sakerv1.GatewayStreamResponse{
		ResponseId: r.ResponseID, RequestId: r.RequestID,
		Status: sakerv1.GatewayAckStatus(r.Status), ReasonCode: r.ReasonCode,
	}
	if r.Payload != nil {
		switch r.Payload.Kind {
		case GatewayPayloadCommand:
			command := &sakerv1.StreamCommand{}
			if proto.Unmarshal(r.Payload.Value, command) == nil {
				message.Payload = &sakerv1.GatewayStreamResponse_Command{Command: command}
			}
		case GatewayPayloadBatch:
			batch := &sakerv1.TelemetryBatch{}
			if proto.Unmarshal(r.Payload.Value, batch) == nil {
				message.Payload = &sakerv1.GatewayStreamResponse_TelemetryBatch{TelemetryBatch: batch}
			}
		}
	}
	wire, err := proto.Marshal(message)
	if err != nil {
		panic(err)
	}
	return wire
}

func GatewayResponse(requestID string, status GatewayAckStatus, reasonCode string) []byte {
	return GatewayStreamResponse{ResponseID: fmt.Sprintf("grpc-%s", reasonCode), RequestID: requestID, Status: status, ReasonCode: reasonCode}.ToWire()
}

func generatedRequestPayload(message *sakerv1.GatewayStreamRequest) (GatewayStreamRequestPayload, error) {
	switch payload := message.Payload.(type) {
	case *sakerv1.GatewayStreamRequest_Telemetry:
		wire, err := proto.Marshal(payload.Telemetry)
		return GatewayStreamRequestPayload{Kind: GatewayPayloadTelemetry, Value: wire}, err
	case *sakerv1.GatewayStreamRequest_StreamEvent:
		wire, err := proto.Marshal(payload.StreamEvent)
		return GatewayStreamRequestPayload{Kind: GatewayPayloadStream, Value: wire}, err
	case *sakerv1.GatewayStreamRequest_CommandAck:
		wire, err := proto.Marshal(payload.CommandAck)
		return GatewayStreamRequestPayload{Kind: GatewayPayloadCommandAck, Value: wire}, err
	default:
		return GatewayStreamRequestPayload{}, fmt.Errorf("gateway request must contain exactly one payload")
	}
}
