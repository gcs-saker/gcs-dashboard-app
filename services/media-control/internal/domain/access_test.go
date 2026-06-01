package domain

import "testing"

func TestStreamGroupResolverUsesExplicitMappingBeforeDefault(t *testing.T) {
	resolver, err := NewStreamGroupResolver("co-a", "raw.sample.front=co-b,raw/local/webcam=co-a")
	if err != nil {
		t.Fatal(err)
	}

	sample, err := ParseStreamID("raw.sample.front")
	if err != nil {
		t.Fatal(err)
	}
	webcam, err := ParseStreamPath("raw/local/webcam")
	if err != nil {
		t.Fatal(err)
	}
	unknown, err := ParseStreamID("raw.unknown.front")
	if err != nil {
		t.Fatal(err)
	}

	if resolver.TargetFor(sample).PublisherGroupID != "co-b" {
		t.Fatalf("expected sample front to map to co-b")
	}
	if resolver.TargetFor(webcam).PublisherGroupID != "co-a" {
		t.Fatalf("expected local webcam to map to co-a")
	}
	if resolver.TargetFor(unknown).PublisherGroupID != "co-a" {
		t.Fatalf("expected unknown stream to use default group")
	}
}

func TestStreamGroupResolverRejectsInvalidMapping(t *testing.T) {
	if _, err := NewStreamGroupResolver("co-a", "raw.sample.front"); err == nil {
		t.Fatal("expected invalid mapping to fail")
	}
}

func TestStreamGroupMappingsResolveBothPathAndStreamID(t *testing.T) {
	mappings, err := NewStreamGroupMappings("raw.sample.front=co-b,raw/local/webcam=co-a")
	if err != nil {
		t.Fatal(err)
	}
	fromID, _ := ParseStreamID("raw.sample.front")
	fromPath, _ := ParseStreamPath("raw/local/webcam")

	if groupID, ok := mappings.Find(fromID); !ok || groupID != "co-b" {
		t.Fatalf("expected stream id mapping, got %q ok=%v", groupID, ok)
	}
	if groupID, ok := mappings.Find(fromPath); !ok || groupID != "co-a" {
		t.Fatalf("expected stream path mapping, got %q ok=%v", groupID, ok)
	}
}
