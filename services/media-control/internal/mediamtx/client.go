package mediamtx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
)

const traceOperationListStreams = "media-control.mediamtx.list-streams"

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type WebRTCPublishSession struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

type webRTCSessionListResponse struct {
	Items []struct {
		ID    string `json:"id"`
		State string `json:"state"`
		Path  string `json:"path"`
	} `json:"items"`
}

func (c Client) ListWebRTCPublishSessions(ctx context.Context) ([]WebRTCPublishSession, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v3/webrtcsessions/list", nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mediamtx WebRTC session list returned status %d", response.StatusCode)
	}
	var payload webRTCSessionListResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	result := make([]WebRTCPublishSession, 0, len(payload.Items))
	for _, item := range payload.Items {
		if item.State == "publish" && item.ID != "" && item.Path != "" {
			result = append(result, WebRTCPublishSession{ID: item.ID, Path: item.Path})
		}
	}
	return result, nil
}

func (c Client) KickWebRTCSession(ctx context.Context, sessionID string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v3/webrtcsessions/kick/"+url.PathEscape(sessionID), nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("mediamtx WebRTC session kick returned status %d", response.StatusCode)
	}
	return nil
}

func NewClient(baseURL string, httpClient *http.Client) Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}
	return Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: observability.InstrumentHTTPClient(httpClient, traceOperationListStreams),
	}
}

type pathListResponse struct {
	Items []pathItem `json:"items"`
}

type pathItem struct {
	Name        string       `json:"name"`
	Ready       bool         `json:"ready"`
	Source      pathSource   `json:"source"`
	ReaderCount int          `json:"readerCount"`
	Readers     []pathReader `json:"readers"`
}

type pathSource struct {
	Type string `json:"type"`
}

type pathReader struct {
	Type string `json:"type"`
}

func (c Client) ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error) {
	items, err := c.listPathItems(ctx)
	if err != nil {
		return nil, err
	}
	streams := make([]domain.StreamDescriptor, 0, len(items))
	for _, item := range items {
		stream, include, err := streamDescriptor(item)
		if err != nil {
			return nil, err
		}
		if include {
			streams = append(streams, stream)
		}
	}
	return streams, nil
}

func (c Client) listPathItems(ctx context.Context) ([]pathItem, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v3/paths/list", nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("mediamtx paths list returned status %d", response.StatusCode)
	}

	var payload pathListResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	return payload.Items, nil
}

func streamDescriptor(item pathItem) (domain.StreamDescriptor, bool, error) {
	parsed, err := domain.ParseStreamPath(item.Name)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}
	if parsed.Prefix == "talkback" {
		return domain.StreamDescriptor{}, false, nil
	}
	path, err := domain.NewStreamPath(parsed.Path)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}
	status := domain.StreamStatusRegistered
	if item.Ready {
		status = domain.StreamStatusOnline
	}
	return domain.StreamDescriptor{Path: path, Ready: item.Ready, Source: item.Source.Type,
		Status: status, ReaderCount: item.readerCount()}, true, nil
}

func (i pathItem) readerCount() int {
	if i.ReaderCount > 0 {
		return i.ReaderCount
	}
	return len(i.Readers)
}
