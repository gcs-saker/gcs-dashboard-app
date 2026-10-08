package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessionstore"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/streamcache"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/turn"
)

func newAuthorizer(config runtimeConfig) (authpolicy.CachedAuthorizer, error) {
	if config.deviceRPCTarget != "" {
		client, err := authpolicy.NewMTLSDeviceRPCClient(
			config.deviceRPCTarget, config.deviceRPCToken, config.authPolicyTLS(),
		)
		if err != nil {
			return authpolicy.CachedAuthorizer{}, err
		}
		return authpolicy.NewCachedAuthorizer(client, config.authzCacheTTL), nil
	}
	if !config.authPolicyHTTPFallback {
		return authpolicy.CachedAuthorizer{}, fmt.Errorf("AUTH_POLICY_GRPC_TARGET is required")
	}
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

func newPublishSessionStore(config runtimeConfig) (*sessionstore.RedisStore, error) {
	if config.redisAddress == "" {
		return nil, fmt.Errorf("REDIS_ADDRESS is required for durable publish sessions")
	}
	options, err := redisOptions(config)
	if err != nil {
		return nil, err
	}
	store := sessionstore.NewRedisStoreWithOptions(options)
	ctx, cancel := context.WithTimeout(context.Background(), config.redisTimeout)
	defer cancel()
	if err := store.Ping(ctx); err != nil {
		return nil, fmt.Errorf("connect publish session store: %w", err)
	}
	return store, nil
}

func newStreamLister(config runtimeConfig, metrics *httpapi.Metrics) httpapi.StreamLister {
	var streamLister httpapi.StreamLister = newMediaMTXClient(config, &http.Client{Timeout: 3 * time.Second})
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

func newMediaMTXClient(config runtimeConfig, client *http.Client) mediamtx.Client {
	return mediamtx.NewAuthenticatedClient(
		config.mediaMTXBaseURL, config.mediaMTXAPIUser, config.mediaMTXAPIPassword, client,
	)
}

func newIceServerProvider(config runtimeConfig, metrics *httpapi.Metrics) httpapi.IceServerProvider {
	var provider httpapi.IceServerProvider = turn.NewRegistryWithTurnLimit(
		config.iceServers,
		turn.StaticProbe{},
		config.turnMaxHealthy,
	)
	if config.redisAddress != "" && config.iceServerCacheTTL > 0 {
		provider = turn.NewCachedIceServerProviderWithObserver(
			provider,
			newRedisStringCache(config),
			config.iceServerCacheKey,
			config.iceServerCacheTTL,
			metrics,
		)
	}
	if config.turnCredentialMode == turnCredentialModeStatic {
		return provider
	}
	return turn.NewEphemeralCredentialProvider(provider, config.turnSharedSecret, 5*time.Minute)
}

func newRedisStringCache(config runtimeConfig) streamcache.StringCache {
	options, err := redisOptions(config)
	if err != nil {
		return streamcache.NewRedisStringCache("", "", config.redisTimeout)
	}
	return streamcache.NewRedisStringCacheTLS(
		config.redisAddress,
		config.redisPassword,
		config.redisTimeout,
		options.TLSConfig,
	)
}
