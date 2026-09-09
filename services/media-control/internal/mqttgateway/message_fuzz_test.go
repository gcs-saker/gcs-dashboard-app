package mqttgateway

import "testing"

func FuzzSessionFromTopic(f *testing.F) {
	for _, seed := range []string{"gcs/a/b/device/telemetry", "#", "gcs/../../secret", string(make([]byte, 4096))} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, topic string) {
		session, err := SessionFromTopic(topic)
		if err == nil && (session == "" || len(session) > 256) {
			t.Fatalf("accepted invalid session length")
		}
	})
}
