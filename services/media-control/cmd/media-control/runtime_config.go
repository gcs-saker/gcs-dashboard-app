package main

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type runtimeConfig struct {
	traceExporter       string
	otelServiceName     string
	mediaMTXBaseURL     string
	listenAddress       string
	grpcListenAddress   string
	playback            domain.PlaybackURLBuilder
	groupResolver       domain.StreamGroupResolver
	iceServers          []domain.IceServer
	authMode            string
	authPolicyBaseURL   string
	deviceRPCTarget     string
	deviceRPCToken      string
	deviceRPCCAFile     string
	deviceRPCCertFile   string
	deviceRPCKeyFile    string
	deviceRPCServerName string
	auditIngestToken    string
	authzCacheTTL       time.Duration
	streamCacheTTL      time.Duration
	redisAddress        string
	redisPassword       string
	redisTimeout        time.Duration
	streamCacheKey      string
	streamPresenceKey   string
	streamPresenceTTL   time.Duration
	turnMaxHealthy      int
	turnSharedSecret    string
	iceServerCacheTTL   time.Duration
	iceServerCacheKey   string
	publishToken        string
	grpcToken           string
	grpcMaxPayloadBytes int
}

func loadRuntimeConfig() (runtimeConfig, error) {
	publicWebRTCBaseURL := getenv(runtimeEnv.publicWebRTCBaseURL, runtimeDefaults.publicWebRTCBaseURL)
	publicHLSBaseURL := getenv(runtimeEnv.publicHLSBaseURL, runtimeDefaults.publicHLSBaseURL)
	if err := validateExpectedPublicOrigin(
		getenv(runtimeEnv.expectedPublicOrigin, ""),
		publicWebRTCBaseURL,
		publicHLSBaseURL,
	); err != nil {
		return runtimeConfig{}, err
	}
	playback, err := domain.NewPlaybackURLBuilder(
		publicWebRTCBaseURL,
		publicHLSBaseURL,
	)
	if err != nil {
		return runtimeConfig{}, err
	}
	groupResolver, err := domain.NewStreamGroupResolver(
		getenv(runtimeEnv.defaultPublisherGroup, runtimeDefaults.defaultPublisherGroup),
		getenv(runtimeEnv.streamGroupMap, runtimeDefaults.streamGroupMap),
	)
	if err != nil {
		return runtimeConfig{}, err
	}
	publishToken := getenv(runtimeEnv.publishToken, "")
	return runtimeConfig{
		traceExporter:       getenv(runtimeEnv.traceExporter, runtimeDefaults.traceExporter),
		otelServiceName:     getenv(runtimeEnv.otelServiceName, runtimeDefaults.otelServiceName),
		mediaMTXBaseURL:     getenv(runtimeEnv.mediaMTXBaseURL, runtimeDefaults.mediaMTXBaseURL),
		listenAddress:       getenv(runtimeEnv.listenAddress, runtimeDefaults.listenAddress),
		grpcListenAddress:   getenv(runtimeEnv.grpcListenAddress, runtimeDefaults.grpcListenAddress),
		playback:            playback,
		groupResolver:       groupResolver,
		iceServers:          loadIceServers(),
		authMode:            getenv(runtimeEnv.authMode, authpolicy.AuthModeRequired),
		authPolicyBaseURL:   getenv(runtimeEnv.authPolicyBaseURL, runtimeDefaults.authPolicyBaseURL),
		deviceRPCTarget:     getenv("AUTH_POLICY_GRPC_TARGET", ""),
		deviceRPCToken:      getenv("AUTH_POLICY_RPC_TOKEN", ""),
		deviceRPCCAFile:     getenv("AUTH_POLICY_GRPC_CA_FILE", ""),
		deviceRPCCertFile:   getenv("AUTH_POLICY_GRPC_CERT_FILE", ""),
		deviceRPCKeyFile:    getenv("AUTH_POLICY_GRPC_KEY_FILE", ""),
		deviceRPCServerName: getenv("AUTH_POLICY_GRPC_SERVER_NAME", ""),
		auditIngestToken:    getenv("AUTH_POLICY_AUDIT_INGEST_TOKEN", ""),
		authzCacheTTL:       getenvDuration(runtimeEnv.authzCacheTTLSeconds, runtimeDefaults.authzCacheTTL),
		streamCacheTTL:      getenvDuration(runtimeEnv.streamCacheTTLSeconds, runtimeDefaults.streamCacheTTL),
		redisAddress:        getenv(runtimeEnv.redisAddress, runtimeDefaults.redisAddress),
		redisPassword:       getenv(runtimeEnv.redisPassword, runtimeDefaults.redisPassword),
		redisTimeout:        getenvDuration(runtimeEnv.redisTimeoutSeconds, runtimeDefaults.redisTimeout),
		streamCacheKey:      getenv(runtimeEnv.streamCacheKey, runtimeDefaults.streamCacheKey),
		streamPresenceKey:   getenv(runtimeEnv.streamPresencePrefix, runtimeDefaults.streamPresencePrefix),
		streamPresenceTTL:   getenvDuration(runtimeEnv.streamPresenceTTL, runtimeDefaults.streamPresenceTTL),
		turnMaxHealthy:      getenvInt(runtimeEnv.turnMaxHealthyServers, runtimeDefaults.turnMaxHealthyServers),
		turnSharedSecret:    getenv(runtimeEnv.turnPassword, runtimeDefaults.turnPassword),
		iceServerCacheTTL:   getenvDuration(runtimeEnv.iceServerCacheTTL, runtimeDefaults.iceServerCacheTTL),
		iceServerCacheKey:   getenv(runtimeEnv.iceServerCacheKey, runtimeDefaults.iceServerCacheKey),
		publishToken:        publishToken,
		grpcToken:           getenv(runtimeEnv.grpcToken, publishToken),
		grpcMaxPayloadBytes: getenvInt(runtimeEnv.grpcMaxPayloadBytes, runtimeDefaults.grpcMaxPayloadBytes),
	}, nil
}

func (c runtimeConfig) authPolicyTLS() authpolicy.RPCClientTLSConfig {
	return authpolicy.RPCClientTLSConfig{
		CAFile: c.deviceRPCCAFile, CertFile: c.deviceRPCCertFile,
		KeyFile: c.deviceRPCKeyFile, ServerName: c.deviceRPCServerName,
	}
}

func validateExpectedPublicOrigin(expected string, publicBaseURLs ...string) error {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return nil
	}
	expectedURL, err := url.Parse(expected)
	if err != nil || !isOriginURL(expectedURL) {
		return fmt.Errorf("MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN must be an origin without path or query")
	}
	for _, raw := range publicBaseURLs {
		parsed, parseErr := url.Parse(strings.TrimSpace(raw))
		if parseErr != nil || !hasOrigin(parsed, expectedURL) {
			return fmt.Errorf("public media base URL origin does not match MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN")
		}
	}
	return nil
}

func isOriginURL(candidate *url.URL) bool {
	return candidate.Scheme != "" && candidate.Host != "" && candidate.Path == "" && candidate.RawQuery == ""
}

func hasOrigin(candidate *url.URL, expected *url.URL) bool {
	return candidate.Scheme == expected.Scheme && strings.EqualFold(candidate.Host, expected.Host)
}
