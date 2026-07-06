const READY_ICE_CONNECTION_STATES: ReadonlySet<RTCIceConnectionState> = new Set([
  "completed",
  "connected",
]);

const FAILED_PEER_CONNECTION_STATES: ReadonlySet<RTCPeerConnectionState> = new Set([
  "failed",
]);

const FAILED_ICE_CONNECTION_STATES: ReadonlySet<RTCIceConnectionState> = new Set([
  "failed",
]);

export function isPublisherPeerConnectionReady(peerConnection: RTCPeerConnection): boolean {
  return (
    peerConnection.connectionState === "connected" ||
    READY_ICE_CONNECTION_STATES.has(peerConnection.iceConnectionState)
  );
}

export function isPublisherPeerConnectionFailed(peerConnection: RTCPeerConnection): boolean {
  return (
    FAILED_PEER_CONNECTION_STATES.has(peerConnection.connectionState) ||
    FAILED_ICE_CONNECTION_STATES.has(peerConnection.iceConnectionState)
  );
}
