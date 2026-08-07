package main

import (
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
)

const grpcDefaultMaxPayloadBytes = 64 * 1024

type envName string

type runtimeEnvContract struct {
	publicWebRTCBaseURL   envName
	publicHLSBaseURL      envName
	expectedPublicOrigin envName
	defaultPublisherGroup envName
	streamGroupMap        envName
	publishToken          envName
	traceExporter         envName
	otelServiceName       envName
	mediaMTXBaseURL       envName
	listenAddress         envName
	grpcListenAddress     envName
	authMode              envName
	authPolicyBaseURL     envName
	authzCacheTTLSeconds  envName
	streamCacheTTLSeconds envName
	redisAddress          envName
	redisPassword         envName
	redisTimeoutSeconds   envName
	streamCacheKey        envName
	streamPresencePrefix  envName
	streamPresenceTTL     envName
	turnMaxHealthyServers envName
	iceServerCacheTTL     envName
	iceServerCacheKey     envName
	grpcToken             envName
	grpcMaxPayloadBytes   envName
	turnUsername          envName
	turnPassword          envName
	stunURL               envName
	turnPrimaryURL        envName
	turnSecondaryURL      envName
}

var runtimeEnv = runtimeEnvContract{
	publicWebRTCBaseURL:   "MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL",
	publicHLSBaseURL:      "MEDIA_CONTROL_PUBLIC_HLS_BASE_URL",
	expectedPublicOrigin: "MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN",
	defaultPublisherGroup: "MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID",
	streamGroupMap:        "MEDIA_CONTROL_STREAM_GROUP_MAP",
	publishToken:          "MEDIA_CONTROL_PUBLISH_TOKEN",
	traceExporter:         "MEDIA_CONTROL_TRACE_EXPORTER",
	otelServiceName:       "MEDIA_CONTROL_OTEL_SERVICE_NAME",
	mediaMTXBaseURL:       "MEDIAMTX_API_BASE_URL",
	listenAddress:         "MEDIA_CONTROL_LISTEN_ADDR",
	grpcListenAddress:     "MEDIA_CONTROL_GRPC_LISTEN_ADDR",
	authMode:              "MEDIA_CONTROL_AUTH_MODE",
	authPolicyBaseURL:     "AUTH_POLICY_BASE_URL",
	authzCacheTTLSeconds:  "MEDIA_CONTROL_AUTHZ_CACHE_TTL_SECONDS",
	streamCacheTTLSeconds: "MEDIA_CONTROL_STREAM_CACHE_TTL_SECONDS",
	redisAddress:          "MEDIA_CONTROL_REDIS_ADDR",
	redisPassword:         "MEDIA_CONTROL_REDIS_PASSWORD",
	redisTimeoutSeconds:   "MEDIA_CONTROL_REDIS_TIMEOUT_SECONDS",
	streamCacheKey:        "MEDIA_CONTROL_STREAM_CACHE_KEY",
	streamPresencePrefix:  "MEDIA_CONTROL_STREAM_PRESENCE_PREFIX",
	streamPresenceTTL:     "MEDIA_CONTROL_STREAM_PRESENCE_TTL_SECONDS",
	turnMaxHealthyServers: "MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS",
	iceServerCacheTTL:     "MEDIA_CONTROL_ICE_SERVER_CACHE_TTL_SECONDS",
	iceServerCacheKey:     "MEDIA_CONTROL_ICE_SERVER_CACHE_KEY",
	grpcToken:             "MEDIA_CONTROL_GRPC_TOKEN",
	grpcMaxPayloadBytes:   "MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES",
	turnUsername:          "TURN_USERNAME",
	turnPassword:          "TURN_PASSWORD",
	stunURL:               "MEDIA_CONTROL_STUN_URL",
	turnPrimaryURL:        "MEDIA_CONTROL_TURN_PRIMARY_URL",
	turnSecondaryURL:      "MEDIA_CONTROL_TURN_SECONDARY_URL",
}

type runtimeDefaultsContract struct {
	publicWebRTCBaseURL   string
	publicHLSBaseURL      string
	defaultPublisherGroup string
	streamGroupMap        string
	traceExporter         string
	otelServiceName       string
	mediaMTXBaseURL       string
	listenAddress         string
	grpcListenAddress     string
	authPolicyBaseURL     string
	redisAddress          string
	redisPassword         string
	streamCacheKey        string
	streamPresencePrefix  string
	iceServerCacheKey     string
	turnUsername          string
	turnPassword          string
	stunURL               string
	turnPrimaryURL        string
	turnSecondaryURL      string
	authzCacheTTL         time.Duration
	streamCacheTTL        time.Duration
	redisTimeout          time.Duration
	streamPresenceTTL     time.Duration
	iceServerCacheTTL     time.Duration
	turnMaxHealthyServers int
	grpcMaxPayloadBytes   int
}

var runtimeDefaults = runtimeDefaultsContract{
	publicWebRTCBaseURL:   "http://localhost:8080/webrtc",
	publicHLSBaseURL:      "http://localhost:8080/hls",
	defaultPublisherGroup: "co-a",
	streamGroupMap:        "raw/sample/front=co-a,raw/local/webcam=co-a",
	traceExporter:         observability.TraceExporterNone,
	otelServiceName:       "gcs-saker-media-control",
	mediaMTXBaseURL:       "http://mediamtx:9997",
	listenAddress:         ":8081",
	grpcListenAddress:     ":9090",
	authPolicyBaseURL:     "",
	redisAddress:          "",
	redisPassword:         "",
	streamCacheKey:        "gcs-saker:media-control:streams:list",
	streamPresencePrefix:  "gcs-saker:media-control:presence:",
	iceServerCacheKey:     "gcs-saker:media-control:ice-servers",
	turnUsername:          "gcs-turn",
	turnPassword:          "replace-with-secret",
	stunURL:               "stun:turn-primary:3478",
	turnPrimaryURL:        "turn:turn-primary:3478",
	turnSecondaryURL:      "turn:turn-secondary:3478",
	authzCacheTTL:         2 * time.Second,
	streamCacheTTL:        time.Second,
	redisTimeout:          500 * time.Millisecond,
	streamPresenceTTL:     6 * time.Second,
	iceServerCacheTTL:     10 * time.Second,
	turnMaxHealthyServers: 1,
	grpcMaxPayloadBytes:   grpcDefaultMaxPayloadBytes,
}
