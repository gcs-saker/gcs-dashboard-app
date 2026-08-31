import type { WebRTCPlaybackSnapshot } from "@streaming/types";

export function webRTCPlayerDataAttributes(snapshot: WebRTCPlaybackSnapshot) {
  return {
    ...playbackAttributes(snapshot),
    ...audioAttributes(snapshot),
    ...iceAttributes(snapshot),
  };
}

function playbackAttributes(snapshot: WebRTCPlaybackSnapshot) {
  return {
    "data-playback-status": snapshot.status,
    "data-has-video-frame": snapshot.hasVideoFrame ? "true" : "false",
    "data-has-audio-track": snapshot.hasAudioTrack ? "true" : "false",
    "data-audio-active": snapshot.isAudioActive ? "true" : "false",
    "data-audio-playback-state": snapshot.audioPlaybackState,
    "data-first-frame-latency-ms": snapshot.firstFrameLatencyMs ?? "",
    "data-whep-response-ms": snapshot.signalingTimings.whepResponseMs ?? "",
    "data-ice-gathering-done-ms": snapshot.signalingTimings.iceGatheringDoneMs ?? "",
  };
}

function audioAttributes(snapshot: WebRTCPlaybackSnapshot) {
  const stats = snapshot.audioStats;
  return {
    "data-audio-level": attributeValue(stats.audioLevel),
    "data-audio-jitter-ms": attributeValue(stats.jitterMs),
    "data-audio-jitter-buffer-delay-ms": attributeValue(stats.jitterBufferDelayMs),
    "data-audio-packets-lost": attributeValue(stats.packetsLost),
    "data-audio-packets-received": attributeValue(stats.packetsReceived),
    "data-ice-round-trip-time-ms": attributeValue(stats.roundTripTimeMs),
    "data-ice-candidate-type": attributeValue(stats.localCandidateType),
    "data-remote-ice-candidate-type": attributeValue(stats.remoteCandidateType),
    "data-ice-transport": attributeValue(stats.transportProtocol),
    "data-relay-fallback-reason": attributeValue(stats.relayFallbackReason),
  };
}

function attributeValue(value: number | string | null): number | string {
  return value ?? "";
}

function iceAttributes(snapshot: WebRTCPlaybackSnapshot) {
  const stats = snapshot.iceCandidateStats;
  return {
    "data-ice-candidate-total": stats?.total ?? 0,
    "data-ice-candidate-host": stats?.host ?? 0,
    "data-ice-candidate-srflx": stats?.srflx ?? 0,
    "data-ice-candidate-relay": stats?.relay ?? 0,
    "data-ice-candidate-udp": stats?.udp ?? 0,
    "data-ice-candidate-tcp": stats?.tcp ?? 0,
  };
}
