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

export type StreamRuntimeStatus = "registered" | "online" | "offline" | "unknown";

export interface StreamPlaybackUrls {
  webrtc: string | null;
  hls: string | null;
}

export interface StreamPlaybackResponse {
  streamId: string;
  status: StreamRuntimeStatus;
  playbackUrls: StreamPlaybackUrls;
}

export type RealtimePlayerMode = "loading" | "webrtc" | "hls" | "offline" | "error";

export interface RealtimePlayerSnapshot {
  mode: RealtimePlayerMode;
  streamStatus: StreamRuntimeStatus | "unknown";
  errorMessage: string | null;
}

export interface RealtimePlayerProps {
  streamId: string;
  title?: string;
  className?: string;
  fetcher?: typeof fetch;
  onStatusChange?: (snapshot: RealtimePlayerSnapshot) => void;
}
