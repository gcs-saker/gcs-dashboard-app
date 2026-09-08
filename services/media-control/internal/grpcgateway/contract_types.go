package grpcgateway

import sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"

type GatewayAckStatus = sakerv1.GatewayAckStatus

const (
	GatewayAckStatusAccepted     = sakerv1.GatewayAckStatus_GATEWAY_ACK_STATUS_ACCEPTED
	GatewayAckStatusRejected     = sakerv1.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED
	GatewayAckStatusBackpressure = sakerv1.GatewayAckStatus_GATEWAY_ACK_STATUS_BACKPRESSURE
	GatewayAckStatusReconnect    = sakerv1.GatewayAckStatus_GATEWAY_ACK_STATUS_RECONNECT
)

type GatewayPayloadKind string

const (
	GatewayPayloadTelemetry  GatewayPayloadKind = "telemetry"
	GatewayPayloadStream     GatewayPayloadKind = "stream_event"
	GatewayPayloadCommandAck GatewayPayloadKind = "command_ack"
	GatewayPayloadCommand    GatewayPayloadKind = "command"
	GatewayPayloadBatch      GatewayPayloadKind = "telemetry_batch"
)

type GatewayStreamRequestPayload struct {
	Kind  GatewayPayloadKind
	Value []byte
}

type GatewayStreamRequest struct {
	RequestID string
	OrgID     string
	GroupID   string
	AssetID   string
	Payload   GatewayStreamRequestPayload
}

type GatewayStreamResponse struct {
	ResponseID string
	RequestID  string
	Status     GatewayAckStatus
	ReasonCode string
	Payload    *GatewayStreamRequestPayload
}
