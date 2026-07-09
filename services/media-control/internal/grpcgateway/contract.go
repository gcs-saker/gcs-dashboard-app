package grpcgateway

import "fmt"

func DecodeGatewayStreamRequest(payload []byte) (GatewayStreamRequest, error) {
	fields, err := decodeLengthDelimitedFields(payload)
	if err != nil {
		return GatewayStreamRequest{}, err
	}
	payloadField, payloadKind, err := requestPayloadFieldAndKind(fields)
	if err != nil {
		return GatewayStreamRequest{}, err
	}
	return GatewayStreamRequest{
		RequestID: "",
		OrgID:     "",
		GroupID:   "",
		AssetID:   "",
		Payload: GatewayStreamRequestPayload{
			Kind:  payloadKind,
			Value: nil,
		},
	}.withDecodedFields(fields, payloadField)
}

func (r GatewayStreamResponse) ToWire() []byte {
	response := make([]byte, 0, 64)
	response = encodeString(response, responseFieldResponseID, r.ResponseID)
	if r.RequestID != "" {
		response = encodeString(response, responseFieldRequestID, r.RequestID)
	}
	response = encodeVarintField(response, responseFieldStatus, uint64(r.Status))
	response = encodeString(response, responseFieldReasonCode, r.ReasonCode)
	if r.Payload != nil {
		response = encodeBytes(response, responsePayloadField(r.Payload.Kind), r.Payload.Value)
	}
	return response
}

func GatewayResponse(requestID string, status GatewayAckStatus, reasonCode string) []byte {
	return GatewayStreamResponse{
		ResponseID: fmt.Sprintf("grpc-%s", reasonCode),
		RequestID:  requestID,
		Status:     status,
		ReasonCode: reasonCode,
	}.ToWire()
}

func requestPayloadFieldAndKind(fields map[int][][]byte) (int, GatewayPayloadKind, error) {
	candidates := []struct {
		field int
		kind  GatewayPayloadKind
	}{
		{requestFieldTelemetry, GatewayPayloadTelemetry},
		{requestFieldStreamEvent, GatewayPayloadStream},
		{requestFieldCommandAck, GatewayPayloadCommandAck},
	}
	var field int
	var kind GatewayPayloadKind
	for _, candidate := range candidates {
		if len(fields[candidate.field]) > 0 {
			if field != 0 {
				return 0, "", fmt.Errorf("gateway request must contain exactly one payload")
			}
			field = candidate.field
			kind = candidate.kind
		}
	}
	if field == 0 {
		return 0, "", fmt.Errorf("gateway request must contain exactly one payload")
	}
	return field, kind, nil
}

func responsePayloadField(kind GatewayPayloadKind) int {
	switch kind {
	case GatewayPayloadCommand:
		return responseFieldCommand
	case GatewayPayloadBatch:
		return responseFieldTelemetry
	default:
		panic(fmt.Sprintf("unsupported gateway response payload kind: %s", kind))
	}
}

func (r GatewayStreamRequest) withDecodedFields(fields map[int][][]byte, payloadField int) (GatewayStreamRequest, error) {
	var err error
	if r.RequestID, err = singleString(fields, requestFieldRequestID); err != nil {
		return GatewayStreamRequest{}, err
	}
	if r.OrgID, err = singleString(fields, requestFieldOrgID); err != nil {
		return GatewayStreamRequest{}, err
	}
	if r.GroupID, err = singleString(fields, requestFieldGroupID); err != nil {
		return GatewayStreamRequest{}, err
	}
	if r.AssetID, err = singleString(fields, requestFieldAssetID); err != nil {
		return GatewayStreamRequest{}, err
	}
	if r.Payload.Value, err = singleBytes(fields, payloadField); err != nil {
		return GatewayStreamRequest{}, err
	}
	return r, nil
}

func singleString(fields map[int][][]byte, fieldNumber int) (string, error) {
	values := fields[fieldNumber]
	if len(values) != 1 {
		return "", fmt.Errorf("field %d must contain exactly one string", fieldNumber)
	}
	return string(values[0]), nil
}

func singleBytes(fields map[int][][]byte, fieldNumber int) ([]byte, error) {
	values := fields[fieldNumber]
	if len(values) != 1 {
		return nil, fmt.Errorf("field %d must contain exactly one bytes value", fieldNumber)
	}
	return append([]byte(nil), values[0]...), nil
}
