package authpolicy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
)

const lifecycleAuditPath = "/internal/v1/audit/media-lifecycle"

type LifecycleAuditSink struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewLifecycleAuditSink(baseURL string, token string, httpClient *http.Client) (LifecycleAuditSink, error) {
	if len(strings.TrimSpace(token)) < 32 {
		return LifecycleAuditSink{}, fmt.Errorf("audit ingest token must contain at least 32 characters")
	}
	if strings.TrimSpace(baseURL) == "" {
		return LifecycleAuditSink{}, fmt.Errorf("auth-policy base URL is required for audit ingest")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Second}
	}
	return LifecycleAuditSink{strings.TrimRight(baseURL, "/"), token, httpClient}, nil
}

func (s LifecycleAuditSink) RecordTalkbackLifecycle(ctx context.Context, event mediamtx.TalkbackLifecycleEvent) error {
	body, err := json.Marshal(struct {
		GroupID          string    `json:"groupId"`
		SessionReference string    `json:"sessionReference"`
		Operation        string    `json:"operation"`
		OccurredAt       time.Time `json:"occurredAt"`
	}{event.GroupID, event.Reference, event.Operation, event.OccurredAt})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+lifecycleAuditPath, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-GCS-Internal-Token", s.token)
	response, err := s.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return fmt.Errorf("audit ingest returned status %d", response.StatusCode)
	}
	return nil
}
