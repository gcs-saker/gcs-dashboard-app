package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetenvSecretReadsFileAndRejectsAmbiguousInput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "redis-password")
	if err := os.WriteFile(path, []byte("file-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	key := envName("TEST_RUNTIME_SECRET")
	t.Setenv(string(key), "")
	t.Setenv(string(key)+"_FILE", path)
	value, err := getenvSecret(key, "")
	if err != nil || value != "file-secret" {
		t.Fatalf("unexpected secret result: value=%q err=%v", value, err)
	}
	t.Setenv(string(key), "environment-secret")
	if _, err := getenvSecret(key, ""); err == nil || !strings.Contains(err.Error(), "cannot both") {
		t.Fatalf("expected ambiguous input rejection, got %v", err)
	}
}

func TestGetenvSecretRejectsOversizedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "oversized")
	if err := os.WriteFile(path, []byte(strings.Repeat("x", maximumSecretFileBytes+1)), 0o600); err != nil {
		t.Fatal(err)
	}
	key := envName("TEST_OVERSIZED_SECRET")
	t.Setenv(string(key), "")
	t.Setenv(string(key)+"_FILE", path)
	if _, err := getenvSecret(key, ""); err == nil || !strings.Contains(err.Error(), "size is invalid") {
		t.Fatalf("expected size rejection, got %v", err)
	}
}
