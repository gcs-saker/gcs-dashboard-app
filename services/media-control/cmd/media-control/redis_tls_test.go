package main

import "testing"

func TestRedisTLSFailsClosedWithoutTrustOrServerName(t *testing.T) {
	config := runtimeConfig{redisAddress: "redis:6379", redisPassword: "secret"}
	if _, err := redisOptions(config); err == nil {
		t.Fatal("missing Redis TLS configuration was accepted")
	}
	config.redisAllowPlaintext = true
	options, err := redisOptions(config)
	if err != nil || options.TLSConfig != nil {
		t.Fatalf("explicit local-test Redis plaintext rejected: %v", err)
	}
}
