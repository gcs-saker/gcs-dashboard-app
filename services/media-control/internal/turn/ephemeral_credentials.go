package turn

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" // #nosec G505 -- coturn REST authentication requires HMAC-SHA1 by protocol.
	"encoding/base64"
	"encoding/hex"
	"io"
	"strconv"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const credentialNonceBytes = 12

type ServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type EphemeralCredentialProvider struct {
	next   ServerProvider
	secret []byte
	ttl    time.Duration
	now    func() time.Time
	random io.Reader
}

func NewEphemeralCredentialProvider(next ServerProvider, secret string, ttl time.Duration) EphemeralCredentialProvider {
	return EphemeralCredentialProvider{next: next, secret: []byte(secret), ttl: ttl, now: time.Now, random: rand.Reader}
}

func (p EphemeralCredentialProvider) HealthyIceServers() []domain.IceServer {
	servers := p.next.HealthyIceServers()
	for index := range servers {
		if servers[index].Kind != domain.IceServerTURN {
			continue
		}
		username, credential, ok := p.issue()
		if !ok {
			return nil
		}
		servers[index].Username = username
		servers[index].Credential = credential
	}
	return servers
}

func (p EphemeralCredentialProvider) issue() (string, string, bool) {
	if len(p.secret) < 32 || p.ttl <= 0 {
		return "", "", false
	}
	nonce := make([]byte, credentialNonceBytes)
	if _, err := io.ReadFull(p.random, nonce); err != nil {
		return "", "", false
	}
	now := p.now()
	username := formatExpiryUsername(now.Add(p.ttl), hex.EncodeToString(nonce))
	mac := hmac.New(sha1.New, p.secret)
	_, _ = mac.Write([]byte(username))
	return username, base64.StdEncoding.EncodeToString(mac.Sum(nil)), true
}

func formatExpiryUsername(expiry time.Time, nonce string) string {
	return strconv.FormatInt(expiry.Unix(), 10) + ":" + nonce
}
