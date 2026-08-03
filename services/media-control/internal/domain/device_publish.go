package domain

import "errors"

var ErrDevicePublishAccessDenied = errors.New("device publish access denied")

type DevicePublishCommand struct {
	DeviceUUID string `json:"deviceUuid"`
	Credential string `json:"credential"`
	SensorID   string `json:"sensorId"`
	// Deprecated compatibility fields. New device session requests never populate them.
	StreamID string `json:"streamId,omitempty"`
	Path     string `json:"path,omitempty"`
}

type DevicePublishAuthorization struct {
	DeviceUUID          string `json:"deviceUuid"`
	StreamID            string `json:"streamId"`
	Path                string `json:"path"`
	SensorID            string `json:"sensorId"`
	PublisherGroupID    string `json:"publisherGroupId"`
	CredentialVersion   int64  `json:"credentialVersion"`
	DevicePolicyVersion int64  `json:"devicePolicyVersion"`
	Reason              string `json:"reason"`
	PolicyVersion       string `json:"policyVersion"`
}
