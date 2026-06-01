package streamcache

import (
	"bufio"
	"strings"
	"testing"
)

func TestEncodeRESPCommand(t *testing.T) {
	encoded := string(encodeRESPCommand("SETEX", "streams:list", "1", "[]"))

	if encoded != "*4\r\n$5\r\nSETEX\r\n$12\r\nstreams:list\r\n$1\r\n1\r\n$2\r\n[]\r\n" {
		t.Fatalf("unexpected RESP command %q", encoded)
	}
}

func TestReadRESPBulkStringAndNil(t *testing.T) {
	value, err := readRESP(bufio.NewReader(strings.NewReader("$2\r\n[]\r\n")))
	if err != nil {
		t.Fatal(err)
	}
	if value != "[]" {
		t.Fatalf("unexpected bulk string %v", value)
	}

	value, err = readRESP(bufio.NewReader(strings.NewReader("$-1\r\n")))
	if err != nil {
		t.Fatal(err)
	}
	if value != nil {
		t.Fatalf("expected nil bulk string, got %v", value)
	}
}

func TestReadRESPError(t *testing.T) {
	_, err := readRESP(bufio.NewReader(strings.NewReader("-NOAUTH Authentication required.\r\n")))
	if err == nil {
		t.Fatal("expected redis error response")
	}
}
