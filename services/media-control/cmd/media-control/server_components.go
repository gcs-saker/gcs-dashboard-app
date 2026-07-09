package main

import (
	"net/http"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/streamcache"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/turn"
)

func newAuthorizer(config runtimeConfig) (authpolicy.CachedAuthorizer, error) {
	baseAuthorizer, err := authpolicy.NewAuthorizer(
		config.authMode,
		config.authPolicyBaseURL,
		&http.Client{Timeout: 2 * time.Second},
	)
	if err != nil {
		return authpolicy.CachedAuthorizer{}, err
	}
	return authpolicy.NewCachedAuthorizer(baseAuthorizer, config.authzCacheTTL), nil
}

func newStreamLister(config runtimeConfig, metrics *httpapi.Metrics) httpapi.StreamLister {
	var streamLister httpapi.StreamLister = mediamtx.NewClient(
		config.mediaMTXBaseURL,
		&http.Client{Timeout: 3 * time.Second},
	)
	if config.redisAddress == "" || config.streamCacheTTL <= 0 {
		return streamLister
	}
	return streamcache.NewCachedStreamListerWithObserver(
		streamLister,
		newRedisStringCache(config),
		config.streamCacheKey,
		config.streamPresenceKey,
		config.streamCacheTTL,
		config.streamPresenceTTL,
		metrics,
	)
}

func newIceServerProvider(config runtimeConfig, metrics *httpapi.Metrics) httpapi.IceServerProvider {
	var provider httpapi.IceServerProvider = turn.NewRegistryWithTurnLimit(
		config.iceServers,
		turn.StaticProbe{},
		config.turnMaxHealthy,
	)
	if config.redisAddress == "" || config.iceServerCacheTTL <= 0 {
		return provider
	}
	return turn.NewCachedIceServerProviderWithObserver(
		provider,
		newRedisStringCache(config),
		config.iceServerCacheKey,
		config.iceServerCacheTTL,
		metrics,
	)
}

func newRedisStringCache(config runtimeConfig) streamcache.StringCache {
	return streamcache.NewRedisStringCache(
		config.redisAddress,
		config.redisPassword,
		config.redisTimeout,
	)
}
