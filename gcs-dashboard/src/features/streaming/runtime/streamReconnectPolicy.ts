import type { WebRTCPlaybackSnapshot } from "@streaming/types";

export const DEFAULT_WEBRTC_RECONNECT_DELAYS_MS = [500, 1000] as const;

const RELAY_CANDIDATE_TYPE = "relay";

const RECOVERABLE_CONNECTION_STATES = new Set<RTCPeerConnectionState>([
  "disconnected",
  "failed",
  "closed",
]);

const RECOVERABLE_ICE_STATES = new Set<RTCIceConnectionState>([
  "disconnected",
  "failed",
  "closed",
]);

export function getNextWebRTCRetryDelay(
  completedAttempts: number,
  delaysMs: readonly number[] = DEFAULT_WEBRTC_RECONNECT_DELAYS_MS,
): number | null {
  return delaysMs[completedAttempts] ?? null;
}

export function shouldFallbackAfterWebRTCRetry(
  completedAttempts: number,
  delaysMs: readonly number[] = DEFAULT_WEBRTC_RECONNECT_DELAYS_MS,
): boolean {
  return getNextWebRTCRetryDelay(completedAttempts, delaysMs) === null;
}

export function isRecoverableWebRTCFailure(snapshot: WebRTCPlaybackSnapshot): boolean {
  if (snapshot.status === "error") {
    return true;
  }

  return (
    isRecoverableConnectionState(snapshot.connectionState) ||
    isRecoverableIceConnectionState(snapshot.iceConnectionState)
  );
}

export function describeWebRTCFailure(snapshot: WebRTCPlaybackSnapshot): string {
  if (snapshot.errorMessage) {
    return snapshot.errorMessage;
  }

  if (isRecoverableConnectionState(snapshot.connectionState)) {
    return `WebRTC peer connection ${snapshot.connectionState}`;
  }

  if (isRecoverableIceConnectionState(snapshot.iceConnectionState)) {
    return `WebRTC ICE connection ${snapshot.iceConnectionState}`;
  }

  return "WebRTC connection interrupted";
}

export function shouldSkipWebRTCRetryAfterRelayFailure(snapshot: WebRTCPlaybackSnapshot): boolean {
  return (
    isRecoverableWebRTCFailure(snapshot) &&
    (
      snapshot.audioStats.localCandidateType === RELAY_CANDIDATE_TYPE ||
      snapshot.audioStats.relayFallbackReason !== null
    )
  );
}

function isRecoverableConnectionState(
  state: RTCPeerConnectionState | "unsupported",
): state is RTCPeerConnectionState {
  return state !== "unsupported" && RECOVERABLE_CONNECTION_STATES.has(state);
}

function isRecoverableIceConnectionState(
  state: RTCIceConnectionState | "unsupported",
): state is RTCIceConnectionState {
  return state !== "unsupported" && RECOVERABLE_ICE_STATES.has(state);
}
