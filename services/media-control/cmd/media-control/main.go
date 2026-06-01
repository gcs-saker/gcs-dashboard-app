package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/turn"
)

func main() {
	mediaMTXBaseURL := getenv("MEDIAMTX_API_BASE_URL", "http://mediamtx:9997")
	turnUsername := getenv("TURN_USERNAME", "gcs-turn")
	turnPassword := getenv("TURN_PASSWORD", "replace-with-secret")
	listenAddress := getenv("MEDIA_CONTROL_LISTEN_ADDR", ":8081")
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
	authorizer := authpolicy.NewCachedAuthorizer(
		authpolicy.NewClient(getenv("AUTH_POLICY_BASE_URL", ""), &http.Client{Timeout: 2 * time.Second}),
		getenvDuration("MEDIA_CONTROL_AUTHZ_CACHE_TTL_SECONDS", 2*time.Second),
	)

	server := httpapi.NewServer(
		mediamtx.NewClient(mediaMTXBaseURL, &http.Client{Timeout: 3 * time.Second}),
		turn.NewRegistry(iceServers, turn.StaticProbe{}),
		playback,
		&authorizer,
		groupResolver,
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
