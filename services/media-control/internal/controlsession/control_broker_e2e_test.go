package controlsession_test

import (
	"os"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controltransport"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/deviceadapter"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

func TestControlCommandE2EThroughRealBroker(t *testing.T) {
	broker := os.Getenv("TEST_CONTROL_MQTT_URL")
	if broker == "" {
		t.Skip("TEST_CONTROL_MQTT_URL is not set")
	}
	now := time.Now()
	actuator := &e2eActuator{}
	adapter := deviceadapter.New(actuator)
	adapter.BeginLease("control-01", now.Add(30*time.Second), now)
	device := mqttClient(t, broker, "control-device")
	server := mqttClient(t, broker, "control-server")
	defer device.Disconnect(100)
	defer server.Disconnect(100)
	ackWire := make(chan []byte, 1)
	mustToken(t, server.Subscribe("gcs/device/control-01/ack", 1, func(_ mqtt.Client, message mqtt.Message) {
		ackWire <- append([]byte(nil), message.Payload()...)
	}))
	mustToken(t, device.Subscribe("gcs/device/session-01/command", 1, func(client mqtt.Client, message mqtt.Message) {
		command := &pb.ControlCommandEnvelope{}
		if proto.Unmarshal(message.Payload(), command) != nil {
			return
		}
		wire, _ := proto.Marshal(adapter.Execute(command, now))
		client.Publish("gcs/device/control-01/ack", 1, false, wire)
	}))
	wire, _ := proto.Marshal(stopCommand(now))
	mustToken(t, server.Publish("gcs/device/session-01/command", 1, false, wire))
	select {
	case received := <-ackWire:
		ack, err := controltransport.DecodeAck("gcs/device/control-01/ack", received)
		if err != nil || ack.Status != pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED || actuator.stops != 1 {
			t.Fatalf("unexpected broker result ack=%v stops=%d err=%v", ack, actuator.stops, err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for broker ACK")
	}
}

func mqttClient(t *testing.T, broker, clientID string) mqtt.Client {
	t.Helper()
	client := mqtt.NewClient(mqtt.NewClientOptions().AddBroker(broker).SetClientID(clientID).
		SetAutoReconnect(false).SetConnectRetry(false).SetConnectTimeout(3 * time.Second))
	mustToken(t, client.Connect())
	return client
}

func mustToken(t *testing.T, token mqtt.Token) {
	t.Helper()
	if !token.WaitTimeout(5*time.Second) || token.Error() != nil {
		t.Fatalf("MQTT operation failed: %v", token.Error())
	}
}
