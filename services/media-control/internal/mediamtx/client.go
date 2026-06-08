package mediamtx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string, httpClient *http.Client) Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}
	return Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
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

	streams := make([]domain.StreamDescriptor, 0, len(payload.Items))
	for _, item := range payload.Items {
		path, err := domain.NewStreamPath(item.Name)
		if err != nil {
			return nil, err
		}
		status := domain.StreamStatusRegistered
		if item.Ready {
			status = domain.StreamStatusOnline
		}
		streams = append(streams, domain.StreamDescriptor{
			Path:        path,
			Ready:       item.Ready,
			Source:      item.Source.Type,
			Status:      status,
			ReaderCount: item.readerCount(),
		})
	}
	return streams, nil
}

func (i pathItem) readerCount() int {
	if i.ReaderCount > 0 {
		return i.ReaderCount
	}
	return len(i.Readers)
}
