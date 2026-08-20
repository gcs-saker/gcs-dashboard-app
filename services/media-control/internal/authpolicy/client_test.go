package authpolicy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

func TestClientAuthorizesStreamThroughAuthPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/policy/streams/access" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("missing authorization header")
		}
		_, _ = w.Write([]byte(`{"streamId":"raw.sample.front","allowed":true,"reason":"same group stream","principalId":"viewer-a","groupId":"co-a","policyVersion":"group-policy-v1","principalVersion":"viewer-a:co-a:viewer"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	decision, err := client.AuthorizeStream(
		context.Background(),
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !decision.Allowed || decision.Reason != "same group stream" {
		t.Fatalf("unexpected decision %#v", decision)
	}
	if decision.PrincipalID != "viewer-a" || decision.GroupID != "co-a" || decision.PolicyVersion == "" || decision.PrincipalVersion == "" {
		t.Fatalf("expected enriched decision metadata, got %#v", decision)
	}
}

func TestClientAuthorizesDevicePublishThroughAuthPolicy(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/policy/devices/publish" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "" {
			t.Fatalf("device publish policy must not forward bearer authorization")
		}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{"deviceUuid":"device-001","streamId":"raw.drone-01.front","path":"raw/drone-01/front","publisherGroupId":"co-a","reason":"device group authorized","policyVersion":"device-policy-v1"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	authorization, err := client.AuthorizeDevicePublish(
		context.Background(),
		domain.DevicePublishCommand{
			DeviceUUID: "device-001",
			Credential: "secret",
			StreamID:   "raw.drone-01.front",
			Path:       "raw/drone-01/front",
		},
	)

	if err != nil {
		t.Fatal(err)
	}
	if requestBody["groupId"] != nil || requestBody["publisherGroupId"] != nil {
		t.Fatalf("device publish request leaked group field: %#v", requestBody)
	}
	if authorization.PublisherGroupID != "co-a" || authorization.PolicyVersion != "device-policy-v1" {
		t.Fatalf("unexpected device publish authorization %#v", authorization)
	}
}

func TestClientAuthorizesAccountPublishWithBearerLogin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/policy/accounts/publish" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer login-token" {
			t.Fatalf("missing account bearer token")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"deviceUuid":"account-abc","streamId":"raw.account-abc.front","path":"raw/account-abc/front","sensorId":"front","publisherGroupId":"co-a","credentialVersion":0,"devicePolicyVersion":1,"reason":"account group authorized","policyVersion":"account-publisher-v1"}`))
	}))
	defer server.Close()
	client := NewClient(server.URL, server.Client())

	authorization, err := client.AuthorizeAccountPublish(context.Background(), domain.AccountPublishCommand{
		Authorization: "Bearer login-token", SensorID: "front",
	})
	if err != nil {
		t.Fatal(err)
	}
	if authorization.StreamID != "raw.account-abc.front" || authorization.PublisherGroupID != "co-a" {
		t.Fatalf("unexpected authorization: %#v", authorization)
	}
}

func TestClientRejectsDeniedDevicePublish(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	_, err := client.AuthorizeDevicePublish(
		context.Background(),
		domain.DevicePublishCommand{DeviceUUID: "device-001", Credential: "wrong", StreamID: "raw.drone.front", Path: "raw/drone/front"},
	)

	if err != domain.ErrDevicePublishAccessDenied {
		t.Fatalf("expected device publish access denied, got %v", err)
	}
}

func TestClientDistinguishesInvalidDevicePublishPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	_, err := client.AuthorizeDevicePublish(
		context.Background(),
		domain.DevicePublishCommand{DeviceUUID: "device-001", Credential: "secret", SensorID: "unknown"},
	)

	if err != domain.ErrDevicePublishPolicyInvalid {
		t.Fatalf("expected invalid device publish policy, got %v", err)
	}
}

func TestNewAuthorizerRequiresAuthPolicyBaseURLByDefault(t *testing.T) {
	_, err := NewAuthorizer("", "", nil)

	if err == nil || !strings.Contains(err.Error(), "auth-policy base URL is required") {
		t.Fatalf("expected fail-closed configuration error, got %v", err)
	}
}

func TestNewAuthorizerAllowsExplicitDevelopmentBypass(t *testing.T) {
	authorizer, err := NewAuthorizer(AuthModeAllowAll, "", nil)
	if err != nil {
		t.Fatal(err)
	}

	decision, err := authorizer.AuthorizeStream(
		context.Background(),
		"",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)

	if err != nil || !decision.Allowed {
		t.Fatalf("expected explicit allow-all bypass, decision=%#v err=%v", decision, err)
	}
}

func TestClientFailsClosedWhenAuthPolicyBaseURLIsMissing(t *testing.T) {
	client := NewClient("", nil)

	decision, err := client.AuthorizeStream(
		context.Background(),
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)

	if err == nil || decision.Allowed {
		t.Fatalf("expected deny when auth-policy URL is missing, decision=%#v err=%v", decision, err)
	}
}

func TestClientRequiresBearerToken(t *testing.T) {
	client := NewClient("http://auth-policy.test", nil)

	_, err := client.AuthorizeStream(
		context.Background(),
		"",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)

	if err != domain.ErrStreamAuthenticationRequired {
		t.Fatalf("expected auth required, got %v", err)
	}
}

func TestClientReturnsAccessDeniedForDenyDecision(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"streamId":"raw.company-b.front","allowed":false,"reason":"outside group"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	decision, err := client.AuthorizeStream(
		context.Background(),
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.company-b.front", Path: "raw/company-b/front", PublisherGroupID: "co-b"},
	)

	if err != domain.ErrStreamAccessDenied {
		t.Fatalf("expected access denied, got %v", err)
	}
	if decision.Allowed {
		t.Fatal("expected deny decision")
	}
}

func TestClientPropagatesTraceParentToAuthPolicy(t *testing.T) {
	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() {
		_ = tp.Shutdown(context.Background())
		otel.SetTracerProvider(noop.NewTracerProvider())
	})

	var observedTraceParent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedTraceParent = r.Header.Get("traceparent")
		_, _ = w.Write([]byte(`{"streamId":"raw.sample.front","allowed":true,"reason":"same group stream"}`))
	}))
	defer server.Close()

	ctx, span := otel.Tracer("test").Start(context.Background(), "incoming-request")
	defer span.End()
	client := NewClient(server.URL, server.Client())
	_, err := client.AuthorizeStream(
		ctx,
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)
	if err != nil {
		t.Fatal(err)
	}

	traceID := span.SpanContext().TraceID().String()
	if observedTraceParent == "" || !strings.Contains(observedTraceParent, traceID) {
		t.Fatalf("expected outbound traceparent to contain trace id %s, got %q", traceID, observedTraceParent)
	}
}
