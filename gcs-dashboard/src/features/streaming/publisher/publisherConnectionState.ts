const DISCONNECTED_PEER_STATES: ReadonlySet<RTCPeerConnectionState> = new Set([
  "closed",
  "disconnected",
  "failed",
]);

const DISCONNECTED_ICE_STATES: ReadonlySet<RTCIceConnectionState> = new Set([
  "closed",
  "disconnected",
  "failed",
]);

export function isPublishedConnectionDisconnected(peerConnection: RTCPeerConnection): boolean {
  return (
    DISCONNECTED_PEER_STATES.has(peerConnection.connectionState) ||
    DISCONNECTED_ICE_STATES.has(peerConnection.iceConnectionState)
  );
}
