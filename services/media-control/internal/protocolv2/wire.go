package protocolv2

import (
	"encoding/binary"
	"fmt"
	"math"
)

const (
	wireTypeVarint          = 0
	wireTypeFixed64         = 1
	wireTypeLengthDelimited = 2
)

type WireMessage struct {
	fields map[int][]any
}

func DecodeWireMessage(payload []byte) (WireMessage, error) {
	cursor := 0
	fields := map[int][]any{}
	for cursor < len(payload) {
		key, next, err := readVarint(payload, cursor)
		if err != nil {
			return WireMessage{}, err
		}
		cursor = next
		fieldNumber := int(key >> 3)
		wireType := int(key & 0b111)
		var value any
		switch wireType {
		case wireTypeVarint:
			result, next, err := readVarint(payload, cursor)
			if err != nil {
				return WireMessage{}, err
			}
			cursor = next
			value = result
		case wireTypeFixed64:
			if cursor+8 > len(payload) {
				return WireMessage{}, fmt.Errorf("fixed64 field exceeds payload size")
			}
			value = math.Float64frombits(binary.LittleEndian.Uint64(payload[cursor : cursor+8]))
			cursor += 8
		case wireTypeLengthDelimited:
			length, next, err := readVarint(payload, cursor)
			if err != nil {
				return WireMessage{}, err
			}
			cursor = next
			end := cursor + int(length)
			if end > len(payload) {
				return WireMessage{}, fmt.Errorf("length-delimited field exceeds payload size")
			}
			value = string(payload[cursor:end])
			cursor = end
		default:
			return WireMessage{}, fmt.Errorf("unsupported wire type: %d", wireType)
		}
		fields[fieldNumber] = append(fields[fieldNumber], value)
	}
	return WireMessage{fields: fields}, nil
}

func (m WireMessage) SingleString(fieldNumber int) (string, error) {
	values := m.fields[fieldNumber]
	if len(values) != 1 {
		return "", fmt.Errorf("field %d must contain exactly one string", fieldNumber)
	}
	value, ok := values[0].(string)
	if !ok {
		return "", fmt.Errorf("field %d must contain a string", fieldNumber)
	}
	return value, nil
}

func (m WireMessage) SingleUint64(fieldNumber int) (uint64, error) {
	values := m.fields[fieldNumber]
	if len(values) != 1 {
		return 0, fmt.Errorf("field %d must contain exactly one integer", fieldNumber)
	}
	value, ok := values[0].(uint64)
	if !ok {
		return 0, fmt.Errorf("field %d must contain an integer", fieldNumber)
	}
	return value, nil
}

func readVarint(payload []byte, cursor int) (uint64, int, error) {
	var result uint64
	var shift uint
	for cursor < len(payload) {
		b := payload[cursor]
		cursor++
		result |= uint64(b&0x7F) << shift
		if b&0x80 == 0 {
			return result, cursor, nil
		}
		shift += 7
	}
	return 0, cursor, fmt.Errorf("unterminated varint")
}
