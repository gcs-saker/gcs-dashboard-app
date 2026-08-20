package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"hash"
	"log"
	"net"
	"net/http"
	"strings"
)

func secureOpaqueToken(prefix string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

func mustOpaqueToken(prefix string) string {
	token, err := secureOpaqueToken(prefix)
	if err != nil {
		panic(err)
	}
	return token
}

func (s Server) hashRenewalToken(token string) []byte {
	mac := hmac.New(sha256.New, []byte(s.publishToken))
	writeHash(mac, token)
	return mac.Sum(nil)
}

func opaqueDeviceStreamIdentity(secret, deviceUUID, sensorID string) (string, string) {
	mac := hmac.New(sha256.New, []byte(secret))
	writeHash(mac, "gcs-saker/device-stream/v1\x00", deviceUUID, "\x00", sensorID)
	handle := "pub_" + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:20])
	return "raw.device." + handle, "raw/device/" + handle
}

func bearerToken(value string) string {
	scheme, token, ok := strings.Cut(strings.TrimSpace(value), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

func (s Server) auditDeviceSession(r *http.Request, event, deviceUUID, result string) {
	ip, ipSource := clientIP(r)
	mac := hmac.New(sha256.New, []byte(s.publishToken))
	writeHash(mac, ip)
	ipFingerprint := base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:12])
	log.Printf(
		"security_audit event=%s result=%s device=%s client_ip_hash=%s client_ip_source=%s",
		event, result, privateDeviceReference(deviceUUID), ipFingerprint, ipSource,
	)
}

func clientIP(r *http.Request) (string, string) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(strings.TrimSpace(host))
	if peer != nil && peer.IsLoopback() {
		if first, _, ok := strings.Cut(r.Header.Get(forwardedForHeader), ","); ok || strings.TrimSpace(first) != "" {
			if parsed := net.ParseIP(strings.TrimSpace(first)); parsed != nil {
				return parsed.String(), "loopback_edge"
			}
		}
	}
	if peer == nil {
		return "unknown", "invalid_direct_peer"
	}
	return peer.String(), "direct_peer"
}

func privateDeviceReference(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return "redacted"
}

func writeHash(destination hash.Hash, values ...string) {
	for _, value := range values {
		if _, err := destination.Write([]byte(value)); err != nil {
			panic("hash write contract failed")
		}
	}
}
