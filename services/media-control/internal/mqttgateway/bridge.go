package mqttgateway

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

const operationTimeout = 5 * time.Second
const ingressQueueCapacity = 64

type IngressMetrics interface {
	ObserveMQTTIngress(result string)
	AdjustMQTTQueueDepth(delta int)
	SetMQTTQueueDepth(depth int)
}

type Config struct {
	URL            string
	Username       string
	Password       string
	AllowPlaintext bool
	TLS            TLSFiles
	Ready          func()
	Metrics        IngressMetrics
}

func (c Config) Validate() error {
	u, err := url.Parse(c.URL)
	if invalidBrokerURL(u, err) || (u.Scheme == "tcp" && (c.Username == "" || c.Password == "")) {
		return errors.New("mqtt_config_invalid")
	}
	if !c.allowedTransport(u.Scheme) {
		return errors.New("mqtt_tls_required")
	}
	if u.Scheme == "ssl" && !c.TLS.Complete() {
		return errors.New("mqtt_mtls_required")
	}
	return nil
}

func invalidBrokerURL(broker *url.URL, err error) bool {
	return err != nil || broker.Host == "" || broker.User != nil
}

func (c Config) allowedTransport(scheme string) bool {
	return scheme == "ssl" || (c.AllowPlaintext && scheme == "tcp")
}

// Run owns the connection and its bounded queue. Failure stops this opt-in adapter,
// never the existing HTTP/gRPC ingress; the caller records the failed state.
func Run(ctx context.Context, config Config, exchange Exchange) error {
	if err := config.Validate(); err != nil {
		return err
	}
	queue := make(chan mqtt.Message, ingressQueueCapacity)
	lost := make(chan struct{}, 1)
	tlsConfig, err := config.TLS.Config()
	if err != nil {
		return err
	}
	options := mqtt.NewClientOptions().AddBroker(config.URL).SetClientID("gcs-media-control").
		SetUsername(config.Username).SetPassword(config.Password).SetCleanSession(true).
		SetAutoReconnect(false).SetConnectRetry(false).SetAutoAckDisabled(true).
		SetConnectTimeout(operationTimeout).SetWriteTimeout(operationTimeout).SetPingTimeout(operationTimeout)
	if tlsConfig != nil {
		options.SetTLSConfig(tlsConfig)
	}
	options.SetConnectionLostHandler(func(mqtt.Client, error) {
		select {
		case lost <- struct{}{}:
		default:
		}
	})
	client := mqtt.NewClient(options)
	defer client.Disconnect(250)
	if err := await(client.Connect()); err != nil {
		return fmt.Errorf("mqtt_connect_failed")
	}
	callback := func(_ mqtt.Client, message mqtt.Message) {
		enqueueMessage(ctx, queue, message, config.Metrics)
	}
	if err := await(client.Subscribe(Subscription, 1, callback)); err != nil {
		return fmt.Errorf("mqtt_subscribe_failed")
	}
	if config.Ready != nil {
		config.Ready()
	}
	return (consumer{client: client, queue: queue, lost: lost, exchange: exchange, metrics: config.Metrics}).run(ctx)
}

func enqueueMessage(ctx context.Context, queue chan<- mqtt.Message, message mqtt.Message, metrics IngressMetrics) bool {
	select {
	case queue <- message:
		observeIngress(metrics, "queued")
		if metrics != nil {
			metrics.AdjustMQTTQueueDepth(1)
		}
		return true
	case <-ctx.Done():
		return false
	default:
		observeIngress(metrics, "backpressure")
		slog.Warn("mqtt_ingress", "result", "backpressure", "error_code", "queue_full")
		return false
	}
}

func observeIngress(metrics IngressMetrics, result string) {
	if metrics != nil {
		metrics.ObserveMQTTIngress(result)
	}
}

func deliver(ctx context.Context, client mqtt.Client, message mqtt.Message, exchange Exchange) error {
	sessionID, err := SessionFromTopic(message.Topic())
	if err != nil {
		message.Ack()
		return nil
	}
	response := &pb.GatewayStreamResponse{Status: pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED, ReasonCode: "mqtt_message_rejected"}
	if !message.Retained() {
		result, handleErr := Handle(ctx, exchange, message.Topic(), message.Payload())
		if handleErr == nil {
			response = result
		}
	}
	wire, err := proto.Marshal(response)
	if err != nil {
		return errors.New("mqtt_result_encode_failed")
	}
	if err := await(client.Publish("gcs/device/"+sessionID+"/result", 1, false, wire)); err != nil {
		return errors.New("mqtt_result_publish_failed")
	}
	message.Ack()
	slog.Info("mqtt_ingress", "operation", "telemetry", "result", response.Status.String())
	return nil
}

func await(token mqtt.Token) error {
	if !token.WaitTimeout(operationTimeout) {
		return errors.New("mqtt_operation_timeout")
	}
	return token.Error()
}
