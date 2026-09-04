package mqttgateway_test

import (
	"context"
	"fmt"
	"net"
	"os"
	"sync/atomic"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mqttgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/proto"
)

type labPolicy struct{}

func (labPolicy) AuthenticateGateway(context.Context, grpcgateway.GatewayCredentials) (grpcgateway.GatewayIdentity, error) {
	return grpcgateway.GatewayIdentity{}, fmt.Errorf("legacy credentials not used in session test")
}
func (labPolicy) ValidateSessionBinding(_ context.Context, s domain.PublishSession) error {
	if s.GroupID != "co-a" || s.DeviceUUID != "drone-1" {
		return fmt.Errorf("binding mismatch")
	}
	return nil
}

type labStore struct{ calls atomic.Int32 }

func (s *labStore) StoreTelemetry(_ context.Context, identity grpcgateway.GatewayIdentity, _ grpcgateway.Telemetry) error {
	if identity.GroupID != "co-a" || identity.Session == nil {
		return fmt.Errorf("missing server-owned group/session")
	}
	s.calls.Add(1)
	return nil
}

func TestRealMQTTToSessionAuthenticatedGRPC(t *testing.T) {
	broker := os.Getenv("TEST_MQTT_URL")
	if broker == "" {
		t.Skip("TEST_MQTT_URL required for isolated MQTT integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	now := time.Now()
	session := domain.PublishSession{SessionID: "ps_mqtttest", DeviceUUID: "drone-1", SensorID: "front",
		StreamID: "raw.device.opaque", Path: "raw/device/opaque", GroupID: "co-a", CredentialVersion: 1, DevicePolicyVersion: 1,
		Status: domain.PublishSessionActive, CreatedAt: now.Add(-time.Second), PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Hour)}
	sessions := domain.NewInMemoryPublishSessionStore()
	if err := sessions.Save(ctx, session); err != nil {
		t.Fatal(err)
	}
	token, err := sessiontoken.IssueDevice("local-fixture-secret", session, "fixture-jti", now)
	if err != nil {
		t.Fatal(err)
	}
	store := &labStore{}
	server := grpc.NewServer()
	grpcgateway.NewDeviceServer(labPolicy{}, 65536, grpcgateway.NewTelemetryHandler(store)).
		WithSessionAuthenticator(grpcgateway.PublishSessionAuthenticator{Store: sessions, Validator: labPolicy{}, Secret: "local-fixture-secret", Now: time.Now}).Register(server)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.Serve(listener) }()
	defer func() { server.Stop(); <-serverDone }()
	connection, err := grpc.NewClient(listener.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	ready := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- mqttgateway.Run(ctx, mqttgateway.Config{URL: broker, Username: "fixture", Password: "fixture", AllowPlaintext: true,
			Ready: func() { close(ready) }}, mqttgateway.GRPCExchange(connection))
	}()
	defer func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	select {
	case <-ready:
	case <-ctx.Done():
		t.Fatal("MQTT bridge did not subscribe")
	}
	client := mqtt.NewClient(mqtt.NewClientOptions().AddBroker(broker).SetClientID("gcs-fixture-publisher").SetAutoReconnect(false).SetConnectTimeout(3 * time.Second))
	defer client.Disconnect(100)
	waitToken(t, client.Connect())
	responses := make(chan *pb.GatewayStreamResponse, 8)
	waitToken(t, client.Subscribe("gcs/device/ps_mqtttest/result", 1, func(_ mqtt.Client, m mqtt.Message) {
		response := &pb.GatewayStreamResponse{}
		if err := proto.Unmarshal(m.Payload(), response); err == nil {
			responses <- response
		}
	}))
	request := &pb.GatewayStreamRequest{RequestId: "valid", AssetId: "drone-1", Payload: &pb.GatewayStreamRequest_Telemetry{Telemetry: &pb.TelemetryEnvelope{
		EventId: "event-1", AssetId: "drone-1", Time: &pb.Timestamped{ObservedUnixMillis: now.UnixMilli()}, Position: &pb.GeoPoint{Latitude: 35.87, Longitude: 128.6},
	}}}
	send := func(access string, expected pb.GatewayAckStatus) {
		t.Helper()
		wire, err := proto.Marshal(&pb.MqttGatewayMessage{PublishToken: access, Request: request})
		if err != nil {
			t.Fatal(err)
		}
		waitToken(t, client.Publish("gcs/device/ps_mqtttest/telemetry", 1, false, wire))
		select {
		case response := <-responses:
			if response.Status != expected {
				t.Fatalf("unexpected result: %s", response.Status)
			}
		case <-ctx.Done():
			t.Fatal("MQTT result timeout")
		}
	}
	send(token, pb.GatewayAckStatus_GATEWAY_ACK_STATUS_ACCEPTED)
	send("forged-token", pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED)
	request.GroupId = "co-b"
	send(token, pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED)
	request.GroupId = ""
	if err := sessions.End(ctx, session.SessionID, time.Now()); err != nil {
		t.Fatal(err)
	}
	send(token, pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED)
	if store.calls.Load() != 1 {
		t.Fatalf("rejected input reached storage: %d", store.calls.Load())
	}
}

func waitToken(t *testing.T, token mqtt.Token) {
	t.Helper()
	if !token.WaitTimeout(5 * time.Second) {
		t.Fatal("MQTT operation timed out")
	}
	if err := token.Error(); err != nil {
		t.Fatal(err)
	}
}
