package protocolv2

import (
	"encoding/binary"
	"math"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestDecodeStreamSessionEventConvertsToDescriptor(t *testing.T) {
	payload := streamSessionEventPayload(streamStatePlayable)

	event, err := DecodeStreamSessionEvent(payload)
	if err != nil {
		t.Fatalf("DecodeStreamSessionEvent returned error: %v", err)
	}
	descriptor, err := event.ToStreamDescriptor()
	if err != nil {
		t.Fatalf("ToStreamDescriptor returned error: %v", err)
	}

	if event.StreamID != "raw.mobile.front" {
		t.Fatalf("unexpected stream id: %s", event.StreamID)
	}
	if descriptor.Path != domain.StreamPath("raw/mobile/front") {
		t.Fatalf("unexpected path: %s", descriptor.Path)
	}
	if descriptor.Status != domain.StreamStatusOnline {
		t.Fatalf("unexpected status: %s", descriptor.Status)
	}
	if !descriptor.Ready {
		t.Fatalf("expected playable event to be ready")
	}
	if descriptor.Source != streamSessionSource {
		t.Fatalf("unexpected source: %s", descriptor.Source)
	}
}

func TestDecodeStreamSessionEventMapsStoppedToOffline(t *testing.T) {
	event, err := DecodeStreamSessionEvent(streamSessionEventPayload(streamStateStopped))
	if err != nil {
		t.Fatalf("DecodeStreamSessionEvent returned error: %v", err)
	}
	descriptor, err := event.ToStreamDescriptor()
	if err != nil {
		t.Fatalf("ToStreamDescriptor returned error: %v", err)
	}

	if descriptor.Status != domain.StreamStatusOffline {
		t.Fatalf("unexpected status: %s", descriptor.Status)
	}
	if descriptor.Ready {
		t.Fatalf("expected stopped event to be not ready")
	}
}

func TestDecodeStreamSessionEventRejectsUnsupportedState(t *testing.T) {
	event, err := DecodeStreamSessionEvent(streamSessionEventPayload(99))
	if err != nil {
		t.Fatalf("DecodeStreamSessionEvent returned error: %v", err)
	}

	if _, err := event.ToStreamDescriptor(); err == nil {
		t.Fatalf("expected unsupported stream state error")
	}
}

func TestDecodeWireMessageRejectsMalformedPayload(t *testing.T) {
	if _, err := DecodeWireMessage([]byte{0x80}); err == nil {
		t.Fatalf("expected unterminated varint error")
	}
}

func streamSessionEventPayload(state uint64) []byte {
	writer := protoWriter{}
	writer.string(streamSessionEventID, "evt-20260618-0001")
	writer.string(streamSessionStreamID, "raw.mobile.front")
	writer.string(streamSessionStreamPath, "raw/mobile/front")
	writer.string(streamSessionPublisherAssetID, "mobile")
	writer.string(streamSessionGroupID, "co-a")
	writer.varint(streamSessionState, state)
	return writer.bytes
}

type protoWriter struct {
	bytes []byte
}

func (w *protoWriter) string(fieldNumber int, value string) {
	encoded := []byte(value)
	w.writeVarint(uint64(fieldNumber<<3 | 2))
	w.writeVarint(uint64(len(encoded)))
	w.bytes = append(w.bytes, encoded...)
}

func (w *protoWriter) varint(fieldNumber int, value uint64) {
	w.writeVarint(uint64(fieldNumber << 3))
	w.writeVarint(value)
}

func (w *protoWriter) double(fieldNumber int, value float64) {
	w.writeVarint(uint64(fieldNumber<<3 | 1))
	buf := make([]byte, 8)
	binary.LittleEndian.PutUint64(buf, math.Float64bits(value))
	w.bytes = append(w.bytes, buf...)
}

func (w *protoWriter) writeVarint(value uint64) {
	for value > 0x7F {
		w.bytes = append(w.bytes, byte(value&0x7F|0x80))
		value >>= 7
	}
	w.bytes = append(w.bytes, byte(value))
}
