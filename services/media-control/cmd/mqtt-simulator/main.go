package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

type simulatorState struct {
	DeviceUUID   string `json:"deviceUuid"`
	SessionID    string `json:"sessionId"`
	PublishToken string `json:"publishToken"`
	MQTTPassword string `json:"mqttPassword"`
}

type simulatorConfig struct {
	Broker   string
	Scenario string
	Count    int
	RateHz   int
	State    simulatorState
}

func main() {
	statePath := flag.String("state", "", "owner-only simulator state file")
	broker := flag.String("broker", "tcp://mqtt-lab:1883", "MQTT broker URL")
	scenario := flag.String("scenario", "normal", "normal, duplicate, forged-token, group-mismatch, stale, reconnect, ended")
	count := flag.Int("count", 50, "number of normal messages")
	rateHz := flag.Int("rate", 10, "normal message rate")
	flag.Parse()
	state, err := loadState(*statePath)
	if err != nil {
		fatal("state_invalid")
	}
	config := simulatorConfig{Broker: *broker, Scenario: *scenario, Count: *count, RateHz: *rateHz, State: state}
	if err := run(config); err != nil {
		fatal(err.Error())
	}
	fmt.Printf("scenario=%s result=PASS messages=%d\n", config.Scenario, expectedMessages(config))
}

func loadState(path string) (simulatorState, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return simulatorState{}, err
	}
	var state simulatorState
	if json.Unmarshal(content, &state) != nil || state.DeviceUUID == "" || state.SessionID == "" ||
		state.PublishToken == "" || state.MQTTPassword == "" {
		return simulatorState{}, fmt.Errorf("required simulator identity missing")
	}
	return state, nil
}

func run(config simulatorConfig) error {
	if err := validateConfig(config); err != nil {
		return err
	}
	if config.Scenario == "reconnect" {
		return runReconnect(config)
	}
	return runSequence(config)
}

func validateConfig(config simulatorConfig) error {
	validCount := config.Count >= 1 && config.Count <= 10000
	validRate := config.RateHz >= 1 && config.RateHz <= 100
	if !validCount || !validRate {
		return fmt.Errorf("simulation_bounds_invalid")
	}
	return nil
}

func runSequence(config simulatorConfig) error {
	client, responses, err := connect(config)
	if err != nil {
		return err
	}
	defer client.Disconnect(250)
	requests := scenarioRequests(config)
	for index, request := range requests {
		token := config.State.PublishToken
		if config.Scenario == "forged-token" {
			token = "forged-token"
		}
		if err := publishAndVerify(client, responses, config.State, token, request, expectedStatus(config.Scenario)); err != nil {
			return err
		}
		if config.Scenario == "normal" && index < len(requests)-1 {
			time.Sleep(time.Second / time.Duration(config.RateHz))
		}
	}
	return nil
}

func connect(config simulatorConfig) (mqtt.Client, <-chan *pb.GatewayStreamResponse, error) {
	options := mqtt.NewClientOptions().AddBroker(config.Broker).SetClientID("virtual-drone-" + randomID()).
		SetUsername(config.State.SessionID).SetPassword(config.State.MQTTPassword).
		SetAutoReconnect(false).SetConnectRetry(false).SetConnectTimeout(5 * time.Second)
	client := mqtt.NewClient(options)
	if err := wait(client.Connect()); err != nil {
		return nil, nil, fmt.Errorf("mqtt_connect_failed")
	}
	responses := make(chan *pb.GatewayStreamResponse, 4)
	topic := "gcs/device/" + config.State.SessionID + "/result"
	if err := wait(client.Subscribe(topic, 1, func(_ mqtt.Client, message mqtt.Message) {
		response := &pb.GatewayStreamResponse{}
		if proto.Unmarshal(message.Payload(), response) == nil {
			responses <- response
		}
	})); err != nil {
		client.Disconnect(100)
		return nil, nil, fmt.Errorf("mqtt_subscribe_failed")
	}
	return client, responses, nil
}

func scenarioRequests(config simulatorConfig) []*pb.GatewayStreamRequest {
	count := config.Count
	if config.Scenario != "normal" {
		count = 1
	}
	requests := make([]*pb.GatewayStreamRequest, 0, count+1)
	for index := 0; index < count; index++ {
		requests = append(requests, telemetryRequest(config, index))
	}
	if config.Scenario == "duplicate" {
		requests = append(requests, requests[0])
	}
	return requests
}

func telemetryRequest(config simulatorConfig, sequence int) *pb.GatewayStreamRequest {
	now := time.Now()
	if config.Scenario == "stale" {
		now = now.Add(-time.Hour)
	}
	group := ""
	if config.Scenario == "group-mismatch" {
		group = "forged-group"
	}
	eventID := fmt.Sprintf("virtual-%s-%d-%d", config.Scenario, now.UnixMilli(), sequence)
	telemetry := &pb.TelemetryEnvelope{
		EventId: eventID, AssetId: config.State.DeviceUUID,
		Time:       &pb.Timestamped{ObservedUnixMillis: now.UnixMilli()},
		Position:   &pb.GeoPoint{Latitude: 35.8714 + float64(sequence)/1_000_000, Longitude: 128.6014},
		HeadingDeg: float64(sequence % 360), BatteryPercent: 80, LinkQualityPercent: 95,
	}
	return &pb.GatewayStreamRequest{
		RequestId: eventID, GroupId: group, AssetId: config.State.DeviceUUID,
		Payload: &pb.GatewayStreamRequest_Telemetry{Telemetry: telemetry},
	}
}

func publishAndVerify(client mqtt.Client, responses <-chan *pb.GatewayStreamResponse, state simulatorState,
	token string, request *pb.GatewayStreamRequest, expected pb.GatewayAckStatus) error {
	wire, err := proto.Marshal(&pb.MqttGatewayMessage{PublishToken: token, Request: request})
	if err != nil {
		return fmt.Errorf("payload_encode_failed")
	}
	if err := wait(client.Publish("gcs/device/"+state.SessionID+"/telemetry", 1, false, wire)); err != nil {
		return fmt.Errorf("mqtt_publish_failed")
	}
	select {
	case response := <-responses:
		if response.Status != expected {
			return fmt.Errorf("unexpected_gateway_status")
		}
	case <-time.After(8 * time.Second):
		return fmt.Errorf("gateway_response_timeout")
	}
	return nil
}

func runReconnect(config simulatorConfig) error {
	for sequence := 0; sequence < 2; sequence++ {
		client, responses, err := connect(config)
		if err != nil {
			return err
		}
		if err := publishAndVerify(client, responses, config.State, config.State.PublishToken,
			telemetryRequest(config, sequence), pb.GatewayAckStatus_GATEWAY_ACK_STATUS_ACCEPTED); err != nil {
			client.Disconnect(100)
			return err
		}
		client.Disconnect(100)
		time.Sleep(200 * time.Millisecond)
	}
	return nil
}

func expectedStatus(scenario string) pb.GatewayAckStatus {
	if scenario == "normal" || scenario == "duplicate" {
		return pb.GatewayAckStatus_GATEWAY_ACK_STATUS_ACCEPTED
	}
	return pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED
}

func expectedMessages(config simulatorConfig) int {
	if config.Scenario == "normal" {
		return config.Count
	}
	if config.Scenario == "duplicate" || config.Scenario == "reconnect" {
		return 2
	}
	return 1
}

func randomID() string {
	value := make([]byte, 8)
	if _, err := rand.Read(value); err != nil {
		fatal("random_unavailable")
	}
	return hex.EncodeToString(value)
}

func wait(token mqtt.Token) error {
	if !token.WaitTimeout(5 * time.Second) {
		return fmt.Errorf("mqtt_operation_timeout")
	}
	return token.Error()
}

func fatal(code string) {
	fmt.Fprintf(os.Stderr, "result=FAIL error_code=%s\n", code)
	os.Exit(1)
}
