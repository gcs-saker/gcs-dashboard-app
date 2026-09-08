import type { WebRTCPlaybackStatus } from "@streaming/types";

const READY_ICE_CONNECTION_STATES: ReadonlySet<RTCIceConnectionState> = new Set([
  "completed",
  "connected",
]);

const INTERRUPTED_CONNECTION_STATES: ReadonlySet<RTCPeerConnectionState> = new Set([
  "closed",
  "disconnected",
  "failed",
]);

const INTERRUPTED_ICE_CONNECTION_STATES: ReadonlySet<RTCIceConnectionState> = new Set([
  "closed",
  "disconnected",
  "failed",
]);

export function isWhepConnectionReady(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
): boolean {
  return connectionState === "connected" || READY_ICE_CONNECTION_STATES.has(iceConnectionState);
}

export function isWhepConnectionInterrupted(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
): boolean {
  return (
    INTERRUPTED_CONNECTION_STATES.has(connectionState) ||
    INTERRUPTED_ICE_CONNECTION_STATES.has(iceConnectionState)
  );
}

export function statusFromConnection(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
  fallbackStatus: WebRTCPlaybackStatus,
): WebRTCPlaybackStatus {
  if (isWhepConnectionReady(connectionState, iceConnectionState)) {
    return "playing";
  }

  if (isWhepConnectionInterrupted(connectionState, iceConnectionState)) {
    return "error";
  }

  return fallbackStatus === "idle" ? "loading" : fallbackStatus;
}
