package grpcgateway

import (
	"fmt"

	"google.golang.org/grpc/encoding"
	"google.golang.org/protobuf/proto"
)

const codecName = "proto"

func init() {
	encoding.RegisterCodec(rawBytesCodec{})
}

type rawBytesCodec struct{}

func (rawBytesCodec) Name() string {
	return codecName
}

func (rawBytesCodec) Marshal(v any) ([]byte, error) {
	payload, ok := v.([]byte)
	if !ok {
		if message, ok := v.(proto.Message); ok {
			return proto.Marshal(message)
		}
		return nil, fmt.Errorf("raw gRPC codec expects []byte message")
	}
	return payload, nil
}

func (rawBytesCodec) Unmarshal(data []byte, v any) error {
	target, ok := v.(*[]byte)
	if !ok {
		if message, ok := v.(proto.Message); ok {
			return proto.Unmarshal(data, message)
		}
		return fmt.Errorf("raw gRPC codec expects *[]byte target")
	}
	*target = append((*target)[:0], data...)
	return nil
}
