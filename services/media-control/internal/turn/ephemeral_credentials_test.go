package turn

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1" // #nosec G505 -- verifies the coturn REST protocol credential.
	"encoding/base64"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type fixedProvider struct {
	servers []domain.IceServer
}

func (p fixedProvider) HealthyIceServers() []domain.IceServer {
	return append([]domain.IceServer(nil), p.servers...)
}

func TestEphemeralCredentialMatchesCoturnRESTContract(t *testing.T) {
	server, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "static", "static", true)
	now := time.Unix(2_000_000_000, 0)
	secret := strings.Repeat("s", 32)
	provider := NewEphemeralCredentialProvider(fixedProvider{[]domain.IceServer{server}}, secret, 5*time.Minute)
	provider.now = func() time.Time { return now }
	provider.random = bytes.NewReader(make([]byte, credentialNonceBytes))

	issued := provider.HealthyIceServers()

	if len(issued) != 1 || !strings.HasPrefix(issued[0].Username, strconv.FormatInt(now.Unix()+300, 10)+":") {
		t.Fatalf("unexpected ephemeral username: %#v", issued)
	}
	mac := hmac.New(sha1.New, []byte(secret))
	_, _ = mac.Write([]byte(issued[0].Username))
	want := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if issued[0].Credential != want {
		t.Fatal("credential does not match coturn REST HMAC")
	}
}

func TestEphemeralCredentialFailsClosedForWeakSecret(t *testing.T) {
	server, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "static", "static", true)
	provider := NewEphemeralCredentialProvider(fixedProvider{[]domain.IceServer{server}}, "weak", time.Minute)

	if servers := provider.HealthyIceServers(); servers != nil {
		t.Fatalf("expected no credentials, got %#v", servers)
	}
}
