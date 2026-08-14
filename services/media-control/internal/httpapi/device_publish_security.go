package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
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
	_, _ = mac.Write([]byte(token))
	return mac.Sum(nil)
}

func opaqueDeviceStreamIdentity(secret, deviceUUID, sensorID string) (string, string) {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte("gcs-saker/device-stream/v1\x00"))
	_, _ = mac.Write([]byte(deviceUUID))
	_, _ = mac.Write([]byte("\x00"))
	_, _ = mac.Write([]byte(sensorID))
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
	ip := clientIP(r)
	mac := hmac.New(sha256.New, []byte(s.publishToken))
	_, _ = mac.Write([]byte(ip))
	ipFingerprint := base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:12])
	log.Printf("security_audit event=%s result=%s device=%s client_ip_hash=%s", event, result, maskDeviceUUID(deviceUUID), ipFingerprint)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(strings.TrimSpace(host))
	if peer != nil && (peer.IsLoopback() || peer.IsPrivate()) {
		if first, _, ok := strings.Cut(r.Header.Get(forwardedForHeader), ","); ok || strings.TrimSpace(first) != "" {
			if parsed := net.ParseIP(strings.TrimSpace(first)); parsed != nil {
				return parsed.String()
			}
		}
	}
	if peer == nil {
		return "unknown"
	}
	return peer.String()
}

func maskDeviceUUID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 8 {
		return "redacted"
	}
	return value[:8] + "-redacted"
}
