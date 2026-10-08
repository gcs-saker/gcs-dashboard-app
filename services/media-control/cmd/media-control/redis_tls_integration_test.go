package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestRedisTLSIntegrationAndServerNameDenial(t *testing.T) {
	address := os.Getenv("TEST_REDIS_TLS_ADDR")
	caFile := os.Getenv("TEST_REDIS_TLS_CA_FILE")
	if address == "" || caFile == "" {
		t.Skip("Redis TLS integration environment is not configured")
	}
	config := runtimeConfig{redisAddress: address, redisPassword: os.Getenv("TEST_REDIS_TLS_PASSWORD"),
		redisTimeout: 2 * time.Second, redisCAFile: caFile, redisServerName: "redis"}
	options, err := redisOptions(config)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(options)
	t.Cleanup(func() { _ = client.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("Redis TLS ping failed: %v", err)
	}

	config.redisServerName = "wrong.internal"
	wrongOptions, err := redisOptions(config)
	if err != nil {
		t.Fatal(err)
	}
	wrongClient := redis.NewClient(wrongOptions)
	t.Cleanup(func() { _ = wrongClient.Close() })
	if err := wrongClient.Ping(ctx).Err(); err == nil {
		t.Fatal("Redis accepted an invalid TLS server name")
	}
}
