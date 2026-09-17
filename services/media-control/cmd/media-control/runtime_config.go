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
	turnCredentialMode  string
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
	config := runtimeConfig{
		traceExporter:       getenv(runtimeEnv.traceExporter, runtimeDefaults.traceExporter),
		otelServiceName:     getenv(runtimeEnv.otelServiceName, runtimeDefaults.otelServiceName),
		mediaMTXBaseURL:     getenv(runtimeEnv.mediaMTXBaseURL, runtimeDefaults.mediaMTXBaseURL),
		listenAddress:       getenv(runtimeEnv.listenAddress, runtimeDefaults.listenAddress),
		grpcListenAddress:   getenv(runtimeEnv.grpcListenAddress, runtimeDefaults.grpcListenAddress),
		playback:            playback,
		groupResolver:       groupResolver,
		iceServers:          loadIceServers(),
		publishToken:        publishToken,
		grpcToken:           getenv(runtimeEnv.grpcToken, publishToken),
		grpcMaxPayloadBytes: getenvInt(runtimeEnv.grpcMaxPayloadBytes, runtimeDefaults.grpcMaxPayloadBytes),
	}
	loadAuthorizationRuntime(&config)
	loadStateRuntime(&config)
	loadTurnRuntime(&config)
	return config, nil
}

func loadAuthorizationRuntime(config *runtimeConfig) {
	config.authMode = getenv(runtimeEnv.authMode, authpolicy.AuthModeRequired)
	config.authPolicyBaseURL = getenv(runtimeEnv.authPolicyBaseURL, runtimeDefaults.authPolicyBaseURL)
	config.deviceRPCTarget = getenv("AUTH_POLICY_GRPC_TARGET", "")
	config.deviceRPCToken = getenv("AUTH_POLICY_RPC_TOKEN", "")
	config.deviceRPCCAFile = getenv("AUTH_POLICY_GRPC_CA_FILE", "")
	config.deviceRPCCertFile = getenv("AUTH_POLICY_GRPC_CERT_FILE", "")
	config.deviceRPCKeyFile = getenv("AUTH_POLICY_GRPC_KEY_FILE", "")
	config.deviceRPCServerName = getenv("AUTH_POLICY_GRPC_SERVER_NAME", "")
	config.auditIngestToken = getenv("AUTH_POLICY_AUDIT_INGEST_TOKEN", "")
	config.authzCacheTTL = getenvDuration(runtimeEnv.authzCacheTTLSeconds, runtimeDefaults.authzCacheTTL)
}

func loadStateRuntime(config *runtimeConfig) {
	config.streamCacheTTL = getenvDuration(runtimeEnv.streamCacheTTLSeconds, runtimeDefaults.streamCacheTTL)
	config.redisAddress = getenv(runtimeEnv.redisAddress, runtimeDefaults.redisAddress)
	config.redisPassword = getenv(runtimeEnv.redisPassword, runtimeDefaults.redisPassword)
	config.redisTimeout = getenvDuration(runtimeEnv.redisTimeoutSeconds, runtimeDefaults.redisTimeout)
	config.streamCacheKey = getenv(runtimeEnv.streamCacheKey, runtimeDefaults.streamCacheKey)
	config.streamPresenceKey = getenv(runtimeEnv.streamPresencePrefix, runtimeDefaults.streamPresencePrefix)
	config.streamPresenceTTL = getenvDuration(runtimeEnv.streamPresenceTTL, runtimeDefaults.streamPresenceTTL)
}

func loadTurnRuntime(config *runtimeConfig) {
	config.turnMaxHealthy = getenvInt(runtimeEnv.turnMaxHealthyServers, runtimeDefaults.turnMaxHealthyServers)
	config.turnCredentialMode = loadTurnCredentialMode()
	config.turnSharedSecret = getenv(runtimeEnv.turnSharedSecret, runtimeDefaults.turnSharedSecret)
	config.iceServerCacheTTL = getenvDuration(runtimeEnv.iceServerCacheTTL, runtimeDefaults.iceServerCacheTTL)
	config.iceServerCacheKey = getenv(runtimeEnv.iceServerCacheKey, runtimeDefaults.iceServerCacheKey)
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
