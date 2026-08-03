package authpolicy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type DeviceTelemetry struct {
	UUID               string  `json:"uuid"`
	Latitude           float64 `json:"latitude"`
	Longitude          float64 `json:"longitude"`
	Altitude           float64 `json:"altitude"`
	Velocity           float64 `json:"velocity"`
	BatteryPercent     float64 `json:"batteryPercent"`
	HeadingDeg         float64 `json:"headingDeg"`
	RollDeg            float64 `json:"rollDeg"`
	PitchDeg           float64 `json:"pitchDeg"`
	YawDeg             float64 `json:"yawDeg"`
	LinkQualityPercent float64 `json:"linkQualityPercent"`
	ObservedUnixMillis int64   `json:"observedUnixMillis"`
}

type DeviceAuthentication struct {
	DeviceUUID          string `json:"deviceUuid"`
	GroupID             string `json:"groupId"`
	CredentialVersion   int64  `json:"credentialVersion"`
	DevicePolicyVersion int64  `json:"devicePolicyVersion"`
}

func (c Client) AuthenticateDevice(ctx context.Context, deviceUUID string, credential string) (DeviceAuthentication, error) {
	body, err := json.Marshal(map[string]string{"deviceUuid": deviceUUID, "credential": credential})
	if err != nil {
		return DeviceAuthentication{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/policy/devices/authenticate", bytes.NewReader(body))
	if err != nil {
		return DeviceAuthentication{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return DeviceAuthentication{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return DeviceAuthentication{}, fmt.Errorf("device authentication returned status %d", response.StatusCode)
	}
	var authentication DeviceAuthentication
	if err := json.NewDecoder(response.Body).Decode(&authentication); err != nil {
		return DeviceAuthentication{}, err
	}
	if authentication.DeviceUUID == "" || authentication.GroupID == "" {
		return DeviceAuthentication{}, fmt.Errorf("device authentication returned incomplete identity")
	}
	return authentication, nil
}

func (c Client) IngestDeviceTelemetry(ctx context.Context, deviceUUID string, credential string, telemetry DeviceTelemetry) error {
	body, err := json.Marshal(telemetry)
	if err != nil {
		return err
	}
	endpoint := c.baseURL + "/api/v1/devices/" + url.PathEscape(deviceUUID) + "/telemetry"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-GCS-Device-UUID", deviceUUID)
	request.Header.Set("X-GCS-Device-Credential", credential)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("auth-policy telemetry ingest returned status %d", response.StatusCode)
	}
	return nil
}
