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

export type HLSFallbackStatus = "idle" | "loading" | "playing" | "error";
export type HLSPlaybackMode = "hlsjs" | "native" | "unsupported";

export interface HLSFallbackSnapshot {
  status: HLSFallbackStatus;
  mode: HLSPlaybackMode;
  errorMessage: string | null;
}

export interface HLSFallbackPlayerProps {
  hlsUrl: string | null;
  streamId?: string;
  title?: string;
  fallbackReason?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onStatusChange?: (snapshot: HLSFallbackSnapshot) => void;
}
