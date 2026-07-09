package main

import (
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
	authzCacheTTL       time.Duration
	streamCacheTTL      time.Duration
	redisAddress        string
	redisPassword       string
	redisTimeout        time.Duration
	streamCacheKey      string
	streamPresenceKey   string
	streamPresenceTTL   time.Duration
	turnMaxHealthy      int
	iceServerCacheTTL   time.Duration
	iceServerCacheKey   string
	publishToken        string
	grpcToken           string
	grpcMaxPayloadBytes int
}

func loadRuntimeConfig() (runtimeConfig, error) {
	playback, err := domain.NewPlaybackURLBuilder(
		getenv(runtimeEnv.publicWebRTCBaseURL, runtimeDefaults.publicWebRTCBaseURL),
		getenv(runtimeEnv.publicHLSBaseURL, runtimeDefaults.publicHLSBaseURL),
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
		authzCacheTTL:       getenvDuration(runtimeEnv.authzCacheTTLSeconds, runtimeDefaults.authzCacheTTL),
		streamCacheTTL:      getenvDuration(runtimeEnv.streamCacheTTLSeconds, runtimeDefaults.streamCacheTTL),
		redisAddress:        getenv(runtimeEnv.redisAddress, runtimeDefaults.redisAddress),
		redisPassword:       getenv(runtimeEnv.redisPassword, runtimeDefaults.redisPassword),
		redisTimeout:        getenvDuration(runtimeEnv.redisTimeoutSeconds, runtimeDefaults.redisTimeout),
		streamCacheKey:      getenv(runtimeEnv.streamCacheKey, runtimeDefaults.streamCacheKey),
		streamPresenceKey:   getenv(runtimeEnv.streamPresencePrefix, runtimeDefaults.streamPresencePrefix),
		streamPresenceTTL:   getenvDuration(runtimeEnv.streamPresenceTTL, runtimeDefaults.streamPresenceTTL),
		turnMaxHealthy:      getenvInt(runtimeEnv.turnMaxHealthyServers, runtimeDefaults.turnMaxHealthyServers),
		iceServerCacheTTL:   getenvDuration(runtimeEnv.iceServerCacheTTL, runtimeDefaults.iceServerCacheTTL),
		iceServerCacheKey:   getenv(runtimeEnv.iceServerCacheKey, runtimeDefaults.iceServerCacheKey),
		publishToken:        publishToken,
		grpcToken:           getenv(runtimeEnv.grpcToken, publishToken),
		grpcMaxPayloadBytes: getenvInt(runtimeEnv.grpcMaxPayloadBytes, runtimeDefaults.grpcMaxPayloadBytes),
	}, nil
}
