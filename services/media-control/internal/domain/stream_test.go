package domain

import "testing"

func TestNewStreamPathRejectsAbsolutePath(t *testing.T) {
	_, err := NewStreamPath("/raw/local/webcam")
	if err == nil {
		t.Fatal("expected absolute stream path to fail")
	}
}

func TestNewStreamPathTrimsWhitespace(t *testing.T) {
	path, err := NewStreamPath(" raw/local/webcam ")
	if err != nil {
		t.Fatal(err)
	}
	if path != StreamPath("raw/local/webcam") {
		t.Fatalf("unexpected stream path %q", path)
	}
}
