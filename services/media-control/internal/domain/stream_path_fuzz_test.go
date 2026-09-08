package domain

import "testing"

func FuzzParseStreamID(f *testing.F) {
	for _, seed := range []string{"raw.asset.front", "talkback.raw.asset.front.operator", "../secret", "", "raw..front"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, value string) {
		parsed, err := ParseStreamID(value)
		if err != nil {
			return
		}
		roundTrip, err := ParseStreamPath(parsed.Path)
		if err != nil || roundTrip.StreamID != parsed.StreamID {
			t.Fatalf("accepted stream ID must round trip: %#v %v", parsed, err)
		}
	})
}
