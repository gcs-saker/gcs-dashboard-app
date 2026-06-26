package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/streamcache"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/turn"
)

func main() {
	traceShutdown, err := observability.InstallTracing(
		getenv("MEDIA_CONTROL_TRACE_EXPORTER", observability.TraceExporterNone),
		getenv("MEDIA_CONTROL_OTEL_SERVICE_NAME", "gcs-saker-media-control"),
		nil,
	)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = traceShutdown(ctx)
	}()

	mediaMTXBaseURL := getenv("MEDIAMTX_API_BASE_URL", "http://mediamtx:9997")
	turnUsername := getenv("TURN_USERNAME", "gcs-turn")
	turnPassword := getenv("TURN_PASSWORD", "replace-with-secret")
	listenAddress := getenv("MEDIA_CONTROL_LISTEN_ADDR", ":8081")
	grpcListenAddress := getenv("MEDIA_CONTROL_GRPC_LISTEN_ADDR", ":9090")
	playback, err := domain.NewPlaybackURLBuilder(
		getenv("MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL", "http://localhost:8080/webrtc"),
		getenv("MEDIA_CONTROL_PUBLIC_HLS_BASE_URL", "http://localhost:8080/hls"),
	)
	if err != nil {
		log.Fatal(err)
	}
	groupResolver, err := domain.NewStreamGroupResolver(
		getenv("MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID", "co-a"),
		getenv("MEDIA_CONTROL_STREAM_GROUP_MAP", "raw/sample/front=co-a,raw/local/webcam=co-a"),
	)
	if err != nil {
		log.Fatal(err)
	}

	iceServers := mustIceServers([]iceServerConfig{
		{URL: getenv("MEDIA_CONTROL_STUN_URL", "stun:turn-primary:3478"), Kind: domain.IceServerSTUN, Healthy: true},
		{URL: getenv("MEDIA_CONTROL_TURN_PRIMARY_URL", "turn:turn-primary:3478"), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
		{URL: getenv("MEDIA_CONTROL_TURN_SECONDARY_URL", "turn:turn-secondary:3478"), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
	})
	baseAuthorizer, err := authpolicy.NewAuthorizer(
		getenv("MEDIA_CONTROL_AUTH_MODE", authpolicy.AuthModeRequired),
		getenv("AUTH_POLICY_BASE_URL", ""),
		&http.Client{Timeout: 2 * time.Second},
	)
	if err != nil {
		log.Fatal(err)
	}
	authorizer := authpolicy.NewCachedAuthorizer(
		baseAuthorizer,
		getenvDuration("MEDIA_CONTROL_AUTHZ_CACHE_TTL_SECONDS", 2*time.Second),
	)
	metrics := httpapi.NewMetrics()
	var streamLister httpapi.StreamLister = mediamtx.NewClient(mediaMTXBaseURL, &http.Client{Timeout: 3 * time.Second})
	streamCacheTTL := getenvDuration("MEDIA_CONTROL_STREAM_CACHE_TTL_SECONDS", time.Second)
	redisAddress := getenv("MEDIA_CONTROL_REDIS_ADDR", "")
	if redisAddress != "" && streamCacheTTL > 0 {
		streamLister = streamcache.NewCachedStreamListerWithObserver(
			streamLister,
			streamcache.NewRedisStringCache(
				redisAddress,
				getenv("MEDIA_CONTROL_REDIS_PASSWORD", ""),
				getenvDuration("MEDIA_CONTROL_REDIS_TIMEOUT_SECONDS", 500*time.Millisecond),
			),
			getenv("MEDIA_CONTROL_STREAM_CACHE_KEY", "gcs-saker:media-control:streams:list"),
			getenv("MEDIA_CONTROL_STREAM_PRESENCE_PREFIX", "gcs-saker:media-control:presence:"),
			streamCacheTTL,
			getenvDuration("MEDIA_CONTROL_STREAM_PRESENCE_TTL_SECONDS", 6*time.Second),
			metrics,
		)
	}

	var iceServerProvider httpapi.IceServerProvider = turn.NewRegistryWithTurnLimit(
		iceServers,
		turn.StaticProbe{},
		getenvInt("MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS", 1),
	)
	iceServerCacheTTL := getenvDuration("MEDIA_CONTROL_ICE_SERVER_CACHE_TTL_SECONDS", 10*time.Second)
	if redisAddress != "" && iceServerCacheTTL > 0 {
		iceServerProvider = turn.NewCachedIceServerProviderWithObserver(
			iceServerProvider,
			streamcache.NewRedisStringCache(
				redisAddress,
				getenv("MEDIA_CONTROL_REDIS_PASSWORD", ""),
				getenvDuration("MEDIA_CONTROL_REDIS_TIMEOUT_SECONDS", 500*time.Millisecond),
			),
			getenv("MEDIA_CONTROL_ICE_SERVER_CACHE_KEY", "gcs-saker:media-control:ice-servers"),
			iceServerCacheTTL,
			metrics,
		)
	}

	server := httpapi.NewServerWithMetrics(
		streamLister,
		iceServerProvider,
		playback,
		&authorizer,
		groupResolver,
		getenv("MEDIA_CONTROL_PUBLISH_TOKEN", ""),
		metrics,
	)

	grpcContext, stopGrpc := context.WithCancel(context.Background())
	defer stopGrpc()
	grpcgateway.Start(
		grpcContext,
		grpcListenAddress,
		getenv("MEDIA_CONTROL_GRPC_TOKEN", getenv("MEDIA_CONTROL_PUBLISH_TOKEN", "")),
		getenvInt("MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES", 64*1024),
	)

	log.Printf("media-control listening on %s", listenAddress)
	if err := http.ListenAndServe(listenAddress, server.Routes()); err != nil {
		log.Fatal(err)
	}
}

type iceServerConfig struct {
	URL        string
	Kind       domain.IceServerKind
	Username   string
	Credential string
	Healthy    bool
}

func mustIceServers(configs []iceServerConfig) []domain.IceServer {
	servers := make([]domain.IceServer, 0, len(configs))
	for _, config := range configs {
		server, err := domain.NewIceServer(config.URL, config.Kind, config.Username, config.Credential, config.Healthy)
		if err != nil {
			log.Fatal(err)
		}
		servers = append(servers, server)
	}
	return servers
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	seconds, err := strconv.ParseFloat(value, 64)
	if err != nil || seconds < 0 {
		return fallback
	}
	return time.Duration(seconds * float64(time.Second))
}

func getenvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return fallback
	}
	return parsed
}
