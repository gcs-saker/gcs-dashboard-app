package mqtttopic

import (
	"errors"
	"regexp"
	"strings"
)

type Channel string

const (
	Telemetry  Channel = "telemetry"
	Result     Channel = "result"
	Command    Channel = "command"
	CommandAck Channel = "command_ack"

	TelemetrySubscription  = "gcs/device/+/+/telemetry"
	CommandAckSubscription = "gcs/device/+/+/command_ack"
)

var (
	ErrTopicInvalid = errors.New("mqtt_topic_invalid")
	devicePattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
	sessionPattern  = regexp.MustCompile(`^ps_[A-Za-z0-9_-]{1,96}$`)
)

type Topic struct {
	DeviceUUID     string
	PublishSession string
	Channel        Channel
}

func New(deviceUUID, publishSession string, channel Channel) (Topic, error) {
	if !devicePattern.MatchString(deviceUUID) || !sessionPattern.MatchString(publishSession) || !validChannel(channel) {
		return Topic{}, ErrTopicInvalid
	}
	return Topic{DeviceUUID: deviceUUID, PublishSession: publishSession, Channel: channel}, nil
}

func Parse(raw string) (Topic, error) {
	parts := strings.Split(raw, "/")
	if len(parts) != 5 || parts[0] != "gcs" || parts[1] != "device" {
		return Topic{}, ErrTopicInvalid
	}
	return New(parts[2], parts[3], Channel(parts[4]))
}

func (t Topic) String() string {
	return strings.Join([]string{"gcs", "device", t.DeviceUUID, t.PublishSession, string(t.Channel)}, "/")
}

func validChannel(channel Channel) bool {
	switch channel {
	case Telemetry, Result, Command, CommandAck:
		return true
	default:
		return false
	}
}
