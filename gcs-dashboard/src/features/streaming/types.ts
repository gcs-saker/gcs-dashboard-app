export type WebRTCPlaybackStatus = "idle" | "loading" | "playing" | "error" | "offline";

export interface WebRTCPlaybackSnapshot {
  status: WebRTCPlaybackStatus;
  connectionState: RTCPeerConnectionState | "unsupported";
  iceConnectionState: RTCIceConnectionState | "unsupported";
  errorMessage: string | null;
  hasVideoFrame: boolean;
  hasAudioTrack: boolean;
  isAudioActive: boolean;
  firstFrameLatencyMs: number | null;
  signalingTimings: WebRTCSignalingTimings;
  audioStats: WebRTCAudioStats;
}

export interface WebRTCSignalingTimings {
  iceServersLoadedMs: number | null;
  offerCreatedMs: number | null;
  localDescriptionSetMs: number | null;
  iceGatheringDoneMs: number | null;
  whepResponseMs: number | null;
  remoteDescriptionSetMs: number | null;
}

export interface WebRTCAudioStats {
  jitterMs: number | null;
  jitterBufferDelayMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  concealedSamples: number | null;
  roundTripTimeMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  transportProtocol: string | null;
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

export type RealtimePlayerMode = "loading" | "webrtc" | "reconnecting" | "hls" | "offline" | "error";

export interface RealtimePlayerSnapshot {
  mode: RealtimePlayerMode;
  streamStatus: StreamRuntimeStatus | "unknown";
  errorMessage: string | null;
  webrtcRetryAttempt?: number;
  hasAudioTrack?: boolean;
  isAudioActive?: boolean;
  webrtcFirstFrameLatencyMs?: number | null;
  webrtcWhepResponseMs?: number | null;
  audioJitterMs?: number | null;
  audioPacketsLost?: number | null;
}

export interface RealtimePlayerProps {
  streamId: string;
  title?: string;
  className?: string;
  fetcher?: typeof fetch;
  reconnectDelaysMs?: readonly number[];
  onStatusChange?: (snapshot: RealtimePlayerSnapshot) => void;
}
