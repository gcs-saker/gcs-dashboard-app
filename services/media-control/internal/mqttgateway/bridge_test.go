package mqttgateway

import (
	"context"
	"errors"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func TestConfigRequiresExplicitSecureOrAuthenticatedLabTransport(t *testing.T) {
	validLab := Config{URL: "tcp://mqtt:1883", Username: "device", Password: "secret", AllowPlaintext: true}
	if err := validLab.Validate(); err != nil {
		t.Fatal(err)
	}
	invalid := []Config{
		{},
		{URL: "tcp://mqtt:1883", AllowPlaintext: true},
		{URL: "tcp://user@mqtt:1883", Username: "device", Password: "secret", AllowPlaintext: true},
		{URL: "tcp://mqtt:1883", Username: "device", Password: "secret"},
		{URL: "ssl://mqtt:8883"},
	}
	for _, config := range invalid {
		if config.Validate() == nil {
			t.Fatalf("invalid config accepted: %#v", config)
		}
	}
}

func TestConsumerStopsOnCancellationOrConnectionLoss(t *testing.T) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := (consumer{lost: make(chan struct{}), queue: make(chan mqtt.Message)}).run(cancelled); err != nil {
		t.Fatal(err)
	}
	lost := make(chan struct{}, 1)
	lost <- struct{}{}
	if err := (consumer{lost: lost, queue: make(chan mqtt.Message)}).run(context.Background()); err == nil || err.Error() != "mqtt_connection_lost" {
		t.Fatalf("unexpected connection loss: %v", err)
	}
}

func TestAwaitReportsTimeoutAndTokenError(t *testing.T) {
	if err := await(fakeToken{waited: false}); err == nil || err.Error() != "mqtt_operation_timeout" {
		t.Fatalf("unexpected timeout error: %v", err)
	}
	want := errors.New("broker rejected operation")
	if err := await(fakeToken{waited: true, err: want}); !errors.Is(err, want) {
		t.Fatalf("unexpected token error: %v", err)
	}
}

type fakeToken struct {
	waited bool
	err    error
}

func (t fakeToken) Wait() bool                     { return t.waited }
func (t fakeToken) WaitTimeout(time.Duration) bool { return t.waited }
func (t fakeToken) Done() <-chan struct{}          { return nil }
func (t fakeToken) Error() error                   { return t.err }
