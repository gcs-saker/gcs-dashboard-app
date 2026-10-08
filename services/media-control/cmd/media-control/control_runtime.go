package main

import (
	"context"
	"errors"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/redis/go-redis/v9"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlapp"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controllease"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controltransport"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mission"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mqttgateway"
)

type controlRuntime struct{ client mqtt.Client }

func (r controlRuntime) Close() {
	if r.client != nil {
		r.client.Disconnect(250)
	}
}

func newControlRuntime(config runtimeConfig, sessions controlapp.ControlRouteResolver, state *redis.Client) (httpapi.ControlService, controlRuntime, error) {
	broker := getenv("MQTT_GATEWAY_URL", "")
	if broker == "" {
		return nil, controlRuntime{}, nil
	}
	client, err := connectControlMQTT(broker)
	if err != nil {
		return nil, controlRuntime{}, err
	}
	transport := controltransport.NewCommandTransport(
		client,
		mission.NewRedisCommandLedger(state, time.Now),
		controltransport.NewRedisSequenceLedger(state, time.Now),
	)
	policy := controlPolicyAdapter{client: authpolicy.NewClient(config.authPolicyBaseURL, nil), now: time.Now}
	application := controlapp.NewControlApplication(policy, controllease.NewRedisLeaseStore(state), sessions, transport)
	return controlHTTPAdapter{application: application}, controlRuntime{client: client}, nil
}

func connectControlMQTT(broker string) (mqtt.Client, error) {
	settings := mqttgateway.Config{URL: broker, Username: getenv("MQTT_GATEWAY_USERNAME", ""),
		Password: getenv("MQTT_GATEWAY_PASSWORD", ""), AllowPlaintext: getenv("MQTT_GATEWAY_ALLOW_PLAINTEXT", "false") == "true",
		TLS: mqttgateway.TLSFiles{
			CAFile: getenv("MQTT_GATEWAY_CA_FILE", ""), CertFile: getenv("MQTT_GATEWAY_CERT_FILE", ""),
			KeyFile: getenv("MQTT_GATEWAY_KEY_FILE", ""), ServerName: getenv("MQTT_GATEWAY_SERVER_NAME", ""),
		}}
	if err := settings.Validate(); err != nil {
		return nil, err
	}
	tlsConfig, err := settings.TLS.Config()
	if err != nil {
		return nil, errors.New("control_mqtt_mtls_required")
	}
	options := mqtt.NewClientOptions().AddBroker(broker).SetClientID("gcs-media-control-control").
		SetUsername(settings.Username).SetPassword(settings.Password).
		SetAutoReconnect(false).SetConnectTimeout(5 * time.Second).SetWriteTimeout(5 * time.Second)
	if tlsConfig != nil {
		options.SetTLSConfig(tlsConfig)
	}
	client := mqtt.NewClient(options)
	token := client.Connect()
	if !token.WaitTimeout(5*time.Second) || token.Error() != nil {
		return nil, errors.New("control_mqtt_connect_failed")
	}
	return client, nil
}

type controlPolicyAdapter struct {
	client authpolicy.Client
	now    func() time.Time
}

func (a controlPolicyAdapter) AuthorizeControl(ctx context.Context, authorization string, target controlapp.ControlPolicyTarget) (bool, error) {
	decision, err := a.client.AuthorizeControl(ctx, authorization, authpolicy.ControlAccessTarget{
		Action: target.Action, DeviceID: target.DeviceID, Command: target.Command,
		ControlSessionID: target.ControlSessionID, HighRiskConfirmed: target.HighRiskConfirmed, Now: a.now(),
	})
	return err == nil && decision.Allowed && decision.GroupID == target.GroupID, err
}

type controlHTTPAdapter struct {
	application *controlapp.ControlApplication
}

func (a controlHTTPAdapter) CreateSession(ctx context.Context, authorization string, request httpapi.ControlSessionRequest) (httpapi.ControlSessionResponse, error) {
	response, err := a.application.CreateSession(ctx, authorization, controlapp.SessionRequest{
		DeviceID: request.DeviceID, PublishSession: request.PublishSession,
	})
	return httpapi.ControlSessionResponse{
		ControlSessionID: response.ControlSessionID, ExpiresAt: response.ExpiresAt, HeartbeatMillis: response.HeartbeatMillis,
	}, translateControlError(err)
}

func (a controlHTTPAdapter) SubmitCommand(ctx context.Context, authorization, sessionID string, request httpapi.ControlCommandRequest) (httpapi.ControlCommandResponse, error) {
	response, err := a.application.SubmitCommand(ctx, authorization, sessionID, controlapp.CommandRequest{
		Command: request.Command, Sequence: request.Sequence, IdempotencyID: request.IdempotencyID,
		Forward: request.Forward, Right: request.Right,
	})
	return httpapi.ControlCommandResponse{CommandID: response.CommandID, Status: response.Status}, translateControlError(err)
}

func translateControlError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, controlapp.ErrDenied) {
		return httpapi.ErrControlDenied
	}
	if errors.Is(err, controlapp.ErrConflict) {
		return httpapi.ErrControlConflict
	}
	return httpapi.ErrControlUnavailable
}
