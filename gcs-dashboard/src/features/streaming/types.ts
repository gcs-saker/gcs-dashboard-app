import type { WebRTCAudioPlaybackState } from "./playbackTypes";

export * from "./playbackTypes";

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
  webrtcIcePath?: "direct" | "relay" | "unknown";
  webrtcSignalingComplete?: boolean;
  hasAudioTrack?: boolean;
  isAudioActive?: boolean;
  audioPlaybackState?: WebRTCAudioPlaybackState;
  audioDiagnosticMessage?: string;
  audioLevel?: number | null;
  webrtcFirstFrameLatencyMs?: number | null;
  webrtcWhepResponseMs?: number | null;
  audioJitterMs?: number | null;
  audioPacketsLost?: number | null;
  iceRoundTripTimeMs?: number | null;
  localCandidateType?: string | null;
  remoteCandidateType?: string | null;
  iceTransportProtocol?: string | null;
  relayFallbackReason?: string | null;
  iceCandidateTotal?: number;
  iceCandidateRelay?: number;
  iceCandidateSrflx?: number;
}

export interface RealtimePlayerProps {
  streamId: string;
  title?: string;
  className?: string;
  muted?: boolean;
  controls?: boolean;
  showDiagnostics?: boolean;
  fetcher?: typeof fetch;
  reconnectDelaysMs?: readonly number[];
  playbackReadyRetryDelaysMs?: readonly number[];
  onStatusChange?: (snapshot: RealtimePlayerSnapshot) => void;
}
