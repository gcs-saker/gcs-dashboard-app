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
	traceExporter          string
	otelServiceName        string
	otelEndpoint           string
	otelExportTimeout      time.Duration
	otelMaxQueueSize       int
	otelMaxExportBatch     int
	mediaMTXBaseURL        string
	mediaMTXAPIUser        string
	mediaMTXAPIPassword    string
	listenAddress          string
	grpcListenAddress      string
	playback               domain.PlaybackURLBuilder
	groupResolver          domain.StreamGroupResolver
	iceServers             []domain.IceServer
	authMode               string
	authPolicyBaseURL      string
	authPolicyHTTPFallback bool
	deviceRPCTarget        string
	deviceRPCToken         string
	deviceRPCCAFile        string
	deviceRPCCertFile      string
	deviceRPCKeyFile       string
	deviceRPCServerName    string
	auditIngestToken       string
	authzCacheTTL          time.Duration
	streamCacheTTL         time.Duration
	redisAddress           string
	redisPassword          string
	redisTimeout           time.Duration
	redisCAFile            string
	redisCertFile          string
	redisKeyFile           string
	redisServerName        string
	redisAllowPlaintext    bool
	streamCacheKey         string
	streamPresenceKey      string
	streamPresenceTTL      time.Duration
	turnMaxHealthy         int
	turnCredentialMode     string
	turnSharedSecret       string
	iceServerCacheTTL      time.Duration
	iceServerCacheKey      string
	publishToken           string
	grpcToken              string
	grpcMaxPayloadBytes    int
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
	secrets, err := loadPrimaryRuntimeSecrets()
	if err != nil {
		return runtimeConfig{}, err
	}
	config := runtimeConfig{
		mediaMTXBaseURL:     getenv(runtimeEnv.mediaMTXBaseURL, runtimeDefaults.mediaMTXBaseURL),
		mediaMTXAPIUser:     getenv("MEDIAMTX_API_USER", ""),
		mediaMTXAPIPassword: secrets.mediaMTXAPIPassword,
		listenAddress:       getenv(runtimeEnv.listenAddress, runtimeDefaults.listenAddress),
		grpcListenAddress:   getenv(runtimeEnv.grpcListenAddress, runtimeDefaults.grpcListenAddress),
		playback:            playback,
		groupResolver:       groupResolver,
		iceServers:          loadIceServers(),
		publishToken:        publishToken,
		grpcToken:           secrets.grpcToken,
		grpcMaxPayloadBytes: getenvInt(runtimeEnv.grpcMaxPayloadBytes, runtimeDefaults.grpcMaxPayloadBytes),
	}
	loadTracingRuntime(&config)
	if err := loadAuthorizationRuntime(&config); err != nil {
		return runtimeConfig{}, err
	}
	if err := loadStateRuntime(&config); err != nil {
		return runtimeConfig{}, err
	}
	if err := loadTurnRuntime(&config); err != nil {
		return runtimeConfig{}, err
	}
	if err := validateRuntimeCredentialSeparation(config); err != nil {
		return runtimeConfig{}, err
	}
	return config, nil
}

func loadTracingRuntime(config *runtimeConfig) {
	config.traceExporter = getenv(runtimeEnv.traceExporter, runtimeDefaults.traceExporter)
	config.otelServiceName = getenv(runtimeEnv.otelServiceName, runtimeDefaults.otelServiceName)
	config.otelEndpoint = getenv(runtimeEnv.otelEndpoint, runtimeDefaults.otelEndpoint)
	config.otelExportTimeout = getenvDuration(runtimeEnv.otelExportTimeout, runtimeDefaults.otelExportTimeout)
	config.otelMaxQueueSize = getenvInt(runtimeEnv.otelMaxQueueSize, runtimeDefaults.otelMaxQueueSize)
	config.otelMaxExportBatch = getenvInt(runtimeEnv.otelMaxExportBatch, runtimeDefaults.otelMaxExportBatch)
}

type primaryRuntimeSecrets struct {
	grpcToken           string
	mediaMTXAPIPassword string
}

func loadPrimaryRuntimeSecrets() (primaryRuntimeSecrets, error) {
	grpcToken, err := getenvSecret(runtimeEnv.grpcToken, "")
	if err != nil {
		return primaryRuntimeSecrets{}, err
	}
	mediaMTXAPIPassword, err := getenvSecret("MEDIAMTX_API_PASSWORD", "")
	if err != nil {
		return primaryRuntimeSecrets{}, err
	}
	return primaryRuntimeSecrets{grpcToken: grpcToken, mediaMTXAPIPassword: mediaMTXAPIPassword}, nil
}

func loadAuthorizationRuntime(config *runtimeConfig) error {
	rpcToken, err := getenvSecret("AUTH_POLICY_RPC_TOKEN", "")
	if err != nil {
		return err
	}
	auditToken, err := getenvSecret("AUTH_POLICY_AUDIT_INGEST_TOKEN", "")
	if err != nil {
		return err
	}
	config.authMode = getenv(runtimeEnv.authMode, authpolicy.AuthModeRequired)
	config.authPolicyBaseURL = getenv(runtimeEnv.authPolicyBaseURL, runtimeDefaults.authPolicyBaseURL)
	config.authPolicyHTTPFallback = getenv("AUTH_POLICY_ALLOW_HTTP_FALLBACK", "false") == "true"
	config.deviceRPCTarget = getenv("AUTH_POLICY_GRPC_TARGET", "")
	config.deviceRPCToken = rpcToken
	config.deviceRPCCAFile = getenv("AUTH_POLICY_GRPC_CA_FILE", "")
	config.deviceRPCCertFile = getenv("AUTH_POLICY_GRPC_CERT_FILE", "")
	config.deviceRPCKeyFile = getenv("AUTH_POLICY_GRPC_KEY_FILE", "")
	config.deviceRPCServerName = getenv("AUTH_POLICY_GRPC_SERVER_NAME", "")
	config.auditIngestToken = auditToken
	config.authzCacheTTL = getenvDuration(runtimeEnv.authzCacheTTLSeconds, runtimeDefaults.authzCacheTTL)
	return nil
}

func loadStateRuntime(config *runtimeConfig) error {
	redisPassword, err := getenvSecret(runtimeEnv.redisPassword, runtimeDefaults.redisPassword)
	if err != nil {
		return err
	}
	config.streamCacheTTL = getenvDuration(runtimeEnv.streamCacheTTLSeconds, runtimeDefaults.streamCacheTTL)
	config.redisAddress = getenv(runtimeEnv.redisAddress, runtimeDefaults.redisAddress)
	config.redisPassword = redisPassword
	config.redisTimeout = getenvDuration(runtimeEnv.redisTimeoutSeconds, runtimeDefaults.redisTimeout)
	config.redisCAFile = getenv("MEDIA_CONTROL_REDIS_CA_FILE", "")
	config.redisCertFile = getenv("MEDIA_CONTROL_REDIS_CERT_FILE", "")
	config.redisKeyFile = getenv("MEDIA_CONTROL_REDIS_KEY_FILE", "")
	config.redisServerName = getenv("MEDIA_CONTROL_REDIS_SERVER_NAME", "")
	config.redisAllowPlaintext = getenv("MEDIA_CONTROL_REDIS_ALLOW_PLAINTEXT", "false") == "true"
	config.streamCacheKey = getenv(runtimeEnv.streamCacheKey, runtimeDefaults.streamCacheKey)
	config.streamPresenceKey = getenv(runtimeEnv.streamPresencePrefix, runtimeDefaults.streamPresencePrefix)
	config.streamPresenceTTL = getenvDuration(runtimeEnv.streamPresenceTTL, runtimeDefaults.streamPresenceTTL)
	return nil
}

func loadTurnRuntime(config *runtimeConfig) error {
	turnSharedSecret, err := getenvSecret(runtimeEnv.turnSharedSecret, runtimeDefaults.turnSharedSecret)
	if err != nil {
		return err
	}
	config.turnMaxHealthy = getenvInt(runtimeEnv.turnMaxHealthyServers, runtimeDefaults.turnMaxHealthyServers)
	config.turnCredentialMode = loadTurnCredentialMode()
	config.turnSharedSecret = turnSharedSecret
	config.iceServerCacheTTL = getenvDuration(runtimeEnv.iceServerCacheTTL, runtimeDefaults.iceServerCacheTTL)
	config.iceServerCacheKey = getenv(runtimeEnv.iceServerCacheKey, runtimeDefaults.iceServerCacheKey)
	return nil
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
