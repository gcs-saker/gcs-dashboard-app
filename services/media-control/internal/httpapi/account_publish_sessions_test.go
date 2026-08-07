package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type fakeAccountPublisher struct {
	observed      *domain.AccountPublishCommand
	authorization domain.DevicePublishAuthorization
}

func (f fakeAccountPublisher) AuthorizeAccountPublish(
	_ context.Context,
	command domain.AccountPublishCommand,
) (domain.DevicePublishAuthorization, error) {
	if f.observed != nil {
		*f.observed = command
	}
	return f.authorization, nil
}

func TestAccountPublishSessionUsesBearerLoginAndServerOwnedDestination(t *testing.T) {
	observed := domain.AccountPublishCommand{}
	server := newTestServer(fakeStreams{}, fakeIce{}).
		WithAccountPublishAuthorizer(fakeAccountPublisher{
			observed: &observed,
			authorization: domain.DevicePublishAuthorization{
				DeviceUUID: "account-abc", SensorID: "front", StreamID: "raw.account-abc.front",
				Path: "raw/account-abc/front", PublisherGroupID: "co-a", DevicePolicyVersion: 1,
			},
		}).
		WithPublishSessionStore(domain.NewInMemoryPublishSessionStore())
	request := httptest.NewRequest(http.MethodPost, routeAccountPublishSessions, strings.NewReader(`{"sensorId":"front"}`))
	request.Header.Set(authorizationHeader, "Bearer login-access-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if observed.Authorization != "Bearer login-access-token" || observed.SensorID != "front" {
		t.Fatalf("account authorization did not receive login identity: %#v", observed)
	}
	created := decodeTestJSON[publishSessionResponse](t, recorder)
	if !strings.HasPrefix(created.StreamID, "raw.device.pub_") || strings.Contains(created.StreamID, "account-abc") {
		t.Fatalf("expected opaque server-owned stream id, got %q", created.StreamID)
	}
}

func TestAccountPublishSessionRejectsMissingLogin(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{}).
		WithAccountPublishAuthorizer(fakeAccountPublisher{}).
		WithPublishSessionStore(domain.NewInMemoryPublishSessionStore())
	request := httptest.NewRequest(http.MethodPost, routeAccountPublishSessions, strings.NewReader(`{"sensorId":"front"}`))
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}
