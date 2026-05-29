package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

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

	iceServers := mustIceServers([]iceServerConfig{
		{URL: getenv("MEDIA_CONTROL_STUN_URL", "stun:turn-primary:3478"), Kind: domain.IceServerSTUN, Healthy: true},
		{URL: getenv("MEDIA_CONTROL_TURN_PRIMARY_URL", "turn:turn-primary:3478"), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
		{URL: getenv("MEDIA_CONTROL_TURN_SECONDARY_URL", "turn:turn-secondary:3478"), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
	})

	server := httpapi.NewServer(
		mediamtx.NewClient(mediaMTXBaseURL, &http.Client{Timeout: 3 * time.Second}),
		turn.NewRegistry(iceServers, turn.StaticProbe{}),
		playback,
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
