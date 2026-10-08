package mqtttopic

import (
	"errors"
	"testing"
)

func TestCanonicalTopicRoundTrip(t *testing.T) {
	topic, err := New("00992056-cfd6-494c-a950-d10aa5d1c536", "ps_session-01", Telemetry)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(topic.String())
	if err != nil || parsed != topic {
		t.Fatalf("unexpected topic round trip: %+v err=%v", parsed, err)
	}
	if topic.String() != "gcs/device/00992056-cfd6-494c-a950-d10aa5d1c536/ps_session-01/telemetry" {
		t.Fatalf("unexpected canonical topic: %s", topic.String())
	}
}

func TestCanonicalTopicRejectsGroupReceiverWildcardAndMalformedIdentity(t *testing.T) {
	invalid := []string{
		"gcs/org/group/device/telemetry",
		"gcs/device/+/ps_session-01/telemetry",
		"gcs/device/device-01/+/telemetry",
		"gcs/device/device-01/ps_session-01/receiver/telemetry",
		"gcs/device/device.01/ps_session-01/telemetry",
		"gcs/device/device-01/session-01/telemetry",
		"gcs/device/device-01/ps_session-01/unknown",
	}
	for _, raw := range invalid {
		if _, err := Parse(raw); !errors.Is(err, ErrTopicInvalid) {
			t.Fatalf("invalid topic accepted: %s", raw)
		}
	}
}

func TestSubscriptionsKeepWildcardsOnServerOwnedSegmentsOnly(t *testing.T) {
	if TelemetrySubscription != "gcs/device/+/+/telemetry" {
		t.Fatal(TelemetrySubscription)
	}
	if CommandAckSubscription != "gcs/device/+/+/command_ack" {
		t.Fatal(CommandAckSubscription)
	}
}
