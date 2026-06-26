package grpcgateway

import (
	"encoding/binary"
	"fmt"
)

const (
	wireTypeVarint          = 0
	wireTypeLengthDelimited = 2
)

func encodeString(payload []byte, fieldNumber int, value string) []byte {
	payload = encodeKey(payload, fieldNumber, wireTypeLengthDelimited)
	payload = encodeVarint(payload, uint64(len(value)))
	return append(payload, []byte(value)...)
}

func encodeVarintField(payload []byte, fieldNumber int, value uint64) []byte {
	payload = encodeKey(payload, fieldNumber, wireTypeVarint)
	return encodeVarint(payload, value)
}

func encodeKey(payload []byte, fieldNumber int, wireType int) []byte {
	return encodeVarint(payload, uint64(fieldNumber<<3|wireType))
}

func encodeVarint(payload []byte, value uint64) []byte {
	var buffer [binary.MaxVarintLen64]byte
	size := binary.PutUvarint(buffer[:], value)
	return append(payload, buffer[:size]...)
}

func readString(fields map[int][][]byte, fieldNumber int) (string, error) {
	values := fields[fieldNumber]
	if len(values) != 1 {
		return "", fmt.Errorf("field %d must contain exactly one string", fieldNumber)
	}
	return string(values[0]), nil
}

func hasAnyField(fields map[int][][]byte, fieldNumbers ...int) bool {
	for _, fieldNumber := range fieldNumbers {
		if len(fields[fieldNumber]) > 0 {
			return true
		}
	}
	return false
}

func decodeLengthDelimitedFields(payload []byte) (map[int][][]byte, error) {
	fields := map[int][][]byte{}
	cursor := 0
	for cursor < len(payload) {
		key, next, err := readVarint(payload, cursor)
		if err != nil {
			return nil, err
		}
		cursor = next
		fieldNumber := int(key >> 3)
		wireType := int(key & 0b111)
		switch wireType {
		case wireTypeVarint:
			_, next, err := readVarint(payload, cursor)
			if err != nil {
				return nil, err
			}
			cursor = next
		case wireTypeLengthDelimited:
			length, next, err := readVarint(payload, cursor)
			if err != nil {
				return nil, err
			}
			cursor = next
			end := cursor + int(length)
			if end > len(payload) {
				return nil, fmt.Errorf("length-delimited field exceeds payload size")
			}
			fields[fieldNumber] = append(fields[fieldNumber], append([]byte(nil), payload[cursor:end]...))
			cursor = end
		default:
			return nil, fmt.Errorf("unsupported wire type: %d", wireType)
		}
	}
	return fields, nil
}

func readVarint(payload []byte, cursor int) (uint64, int, error) {
	value, size := binary.Uvarint(payload[cursor:])
	if size <= 0 {
		return 0, cursor, fmt.Errorf("invalid varint")
	}
	return value, cursor + size, nil
}
