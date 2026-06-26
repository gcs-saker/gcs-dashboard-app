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
)

type Client struct {
	baseURL    string
	httpClient *http.Client
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

	body, err := json.Marshal(target)
	if err != nil {
		return domain.StreamAccessDecision{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/policy/streams/access", bytes.NewReader(body))
	if err != nil {
		return domain.StreamAccessDecision{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", authorization)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return domain.StreamAccessDecision{}, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusUnauthorized {
		return domain.DenyStream(target.StreamID, "authentication required"), domain.ErrStreamAuthenticationRequired
	}
	if response.StatusCode == http.StatusForbidden {
		return domain.DenyStream(target.StreamID, "stream access denied"), domain.ErrStreamAccessDenied
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.StreamAccessDecision{}, fmt.Errorf("auth-policy stream access returned status %d", response.StatusCode)
	}

	var decision domain.StreamAccessDecision
	if err := json.NewDecoder(response.Body).Decode(&decision); err != nil {
		return domain.StreamAccessDecision{}, err
	}
	if !decision.Allowed {
		return decision, domain.ErrStreamAccessDenied
	}
	return decision, nil
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) AuthorizeStream(_ context.Context, _ string, target domain.StreamAccessTarget) (domain.StreamAccessDecision, error) {
	return domain.AllowStream(target.StreamID, "auth-policy disabled"), nil
}
