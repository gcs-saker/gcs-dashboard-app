package authpolicy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
)

const (
	AuthModeRequired              = "required"
	AuthModeAllowAll              = "allow-all"
	traceOperationAuthorizeStream = "media-control.auth-policy.authorize-stream"
	authPolicyStreamAccessPath    = "/policy/streams/access"
	authPolicyDevicePublishPath   = "/policy/devices/publish"
	authPolicyAccountPublishPath  = "/policy/accounts/publish"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func (c Client) AuthorizeAccountPublish(
	ctx context.Context,
	command domain.AccountPublishCommand,
) (domain.DevicePublishAuthorization, error) {
	response, err := c.postJSON(ctx, authPolicyAccountPublishPath, struct {
		SensorID string `json:"sensorId"`
	}{SensorID: command.SensorID}, command.Authorization)
	if err != nil {
		return domain.DevicePublishAuthorization{}, err
	}
	defer response.Body.Close()
	return decodePublishAuthorization(response, "account")
}

func NewAuthorizer(mode string, baseURL string, httpClient *http.Client) (Authorizer, error) {
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode == "" {
		mode = AuthModeRequired
	}
	switch mode {
	case AuthModeRequired:
		client := NewClient(baseURL, httpClient)
		if client.baseURL == "" {
			return nil, fmt.Errorf("auth-policy base URL is required when media-control auth mode is %q", AuthModeRequired)
		}
		return client, nil
	case AuthModeAllowAll:
		return AllowAllAuthorizer{}, nil
	default:
		return nil, fmt.Errorf("unsupported media-control auth mode %q", mode)
	}
}

func NewClient(baseURL string, httpClient *http.Client) Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Second}
	}
	return Client{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		httpClient: observability.InstrumentHTTPClient(httpClient, traceOperationAuthorizeStream),
	}
}

func (c Client) AuthorizeStream(ctx context.Context, authorization string, target domain.StreamAccessTarget) (domain.StreamAccessDecision, error) {
	if c.baseURL == "" {
		return domain.DenyStream(target.StreamID, "auth-policy unavailable"), fmt.Errorf("auth-policy base URL is not configured")
	}
	if strings.TrimSpace(authorization) == "" {
		return domain.DenyStream(target.StreamID, "authentication required"), domain.ErrStreamAuthenticationRequired
	}

	response, err := c.postJSON(ctx, authPolicyStreamAccessPath, target, authorization)
	if err != nil {
		return domain.StreamAccessDecision{}, err
	}
	defer response.Body.Close()

	return decodeStreamDecision(response, target.StreamID)
}

func (c Client) postJSON(ctx context.Context, path string, payload any, authorization string) (*http.Response, error) {
	if c.baseURL == "" {
		return nil, fmt.Errorf("auth-policy base URL is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	if authorization != "" {
		request.Header.Set("Authorization", authorization)
	}
	return c.httpClient.Do(request)
}

func decodePublishAuthorization(response *http.Response, operation string) (domain.DevicePublishAuthorization, error) {
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishAccessDenied
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.DevicePublishAuthorization{}, fmt.Errorf("auth-policy %s publish returned status %d", operation, response.StatusCode)
	}
	var authorization domain.DevicePublishAuthorization
	if err := json.NewDecoder(response.Body).Decode(&authorization); err != nil {
		return authorization, err
	}
	if authorization.PublisherGroupID == "" {
		return authorization, domain.ErrDevicePublishAccessDenied
	}
	return authorization, nil
}

func decodeStreamDecision(response *http.Response, streamID string) (domain.StreamAccessDecision, error) {
	if response.StatusCode == http.StatusUnauthorized {
		return domain.DenyStream(streamID, "authentication required"), domain.ErrStreamAuthenticationRequired
	}
	if response.StatusCode == http.StatusForbidden {
		return domain.DenyStream(streamID, "stream access denied"), domain.ErrStreamAccessDenied
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.StreamAccessDecision{}, fmt.Errorf("auth-policy stream access returned status %d", response.StatusCode)
	}
	var decision domain.StreamAccessDecision
	if err := json.NewDecoder(response.Body).Decode(&decision); err != nil {
		return decision, err
	}
	if !decision.Allowed {
		return decision, domain.ErrStreamAccessDenied
	}
	return decision, nil
}

func (c Client) AuthorizeDevicePublish(
	ctx context.Context,
	command domain.DevicePublishCommand,
) (domain.DevicePublishAuthorization, error) {
	response, err := c.postJSON(ctx, authPolicyDevicePublishPath, command, "")
	if err != nil {
		return domain.DevicePublishAuthorization{}, err
	}
	defer response.Body.Close()
	return decodeDevicePublishAuthorization(response)
}

func decodeDevicePublishAuthorization(response *http.Response) (domain.DevicePublishAuthorization, error) {
	if response.StatusCode == http.StatusForbidden {
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishAccessDenied
	}
	if response.StatusCode == http.StatusBadRequest {
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishPolicyInvalid
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.DevicePublishAuthorization{}, fmt.Errorf("auth-policy device publish returned status %d", response.StatusCode)
	}

	var authorization domain.DevicePublishAuthorization
	if err := json.NewDecoder(response.Body).Decode(&authorization); err != nil {
		return domain.DevicePublishAuthorization{}, err
	}
	if authorization.PublisherGroupID == "" {
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishAccessDenied
	}
	return authorization, nil
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) AuthorizeStream(_ context.Context, _ string, target domain.StreamAccessTarget) (domain.StreamAccessDecision, error) {
	return domain.AllowStream(target.StreamID, "auth-policy disabled"), nil
}
