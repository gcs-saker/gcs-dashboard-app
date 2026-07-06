package grpcgateway

const (
	requestFieldRequestID   = 1
	requestFieldOrgID       = 2
	requestFieldGroupID     = 3
	requestFieldAssetID     = 4
	requestFieldTelemetry   = 10
	requestFieldStreamEvent = 11
	requestFieldCommandAck  = 12
	responseFieldResponseID = 1
	responseFieldRequestID  = 2
	responseFieldStatus     = 3
	responseFieldReasonCode = 4
	responseFieldCommand    = 10
	responseFieldTelemetry  = 11
)

type GatewayAckStatus uint64

const (
	GatewayAckStatusAccepted     GatewayAckStatus = 1
	GatewayAckStatusRejected     GatewayAckStatus = 2
	GatewayAckStatusBackpressure GatewayAckStatus = 3
	GatewayAckStatusReconnect    GatewayAckStatus = 4
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
