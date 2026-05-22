export type WebRTCPlaybackStatus = "idle" | "loading" | "playing" | "error" | "offline";

export interface WebRTCPlaybackSnapshot {
  status: WebRTCPlaybackStatus;
  connectionState: RTCPeerConnectionState | "unsupported";
  iceConnectionState: RTCIceConnectionState | "unsupported";
  errorMessage: string | null;
}

export interface WebRTCPlayerProps {
  whepUrl: string | null;
  streamId?: string;
  title?: string;
  isOnline?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onStatusChange?: (snapshot: WebRTCPlaybackSnapshot) => void;
}
