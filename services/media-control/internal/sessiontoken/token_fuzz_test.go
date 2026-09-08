package sessiontoken

import (
	"testing"
	"time"
)

func FuzzValidateForRoute(f *testing.F) {
	for _, seed := range []string{"", Prefix, Prefix + "bad", "Bearer secret", "../../token"} {
		f.Add(seed, "playback", "raw.asset.front", "raw/asset/front")
	}
	now := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	f.Fuzz(func(t *testing.T, token, action, streamID, path string) {
		_, _ = ValidateForRoute("fuzz-secret-at-least-32-characters", token, action, streamID, path, now)
	})
}
