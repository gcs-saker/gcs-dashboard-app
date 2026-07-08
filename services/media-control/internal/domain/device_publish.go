package domain

import "errors"

var ErrDevicePublishAccessDenied = errors.New("device publish access denied")

type DevicePublishCommand struct {
	DeviceUUID string `json:"deviceUuid"`
	Credential string `json:"credential"`
	StreamID   string `json:"streamId"`
	Path       string `json:"path"`
}

type DevicePublishAuthorization struct {
	DeviceUUID       string `json:"deviceUuid"`
	StreamID         string `json:"streamId"`
	Path             string `json:"path"`
	PublisherGroupID string `json:"publisherGroupId"`
	Reason           string `json:"reason"`
	PolicyVersion    string `json:"policyVersion"`
}
