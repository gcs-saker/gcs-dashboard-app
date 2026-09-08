export type WebRTCPlaybackStatus = "idle" | "loading" | "playing" | "error" | "offline";

export type WebRTCAudioPlaybackState = "no-track" | "receiving" | "track-muted" | "playback-blocked";

export interface WebRTCSignalingTimings {
  iceServersLoadedMs: number | null;
  offerCreatedMs: number | null;
  localDescriptionSetMs: number | null;
  iceGatheringDoneMs: number | null;
  whepResponseMs: number | null;
  remoteDescriptionSetMs: number | null;
}

export interface WebRTCAudioStats {
  audioLevel: number | null;
  jitterMs: number | null;
  jitterBufferDelayMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  concealedSamples: number | null;
  roundTripTimeMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  transportProtocol: string | null;
  relayFallbackReason: string | null;
}

export interface WebRTCIceCandidateStats {
  total: number;
  host: number;
  srflx: number;
  relay: number;
  prflx: number;
  unknown: number;
  udp: number;
  tcp: number;
}

export interface WebRTCPlaybackSnapshot {
  status: WebRTCPlaybackStatus;
  connectionState: RTCPeerConnectionState | "unsupported";
  iceConnectionState: RTCIceConnectionState | "unsupported";
  errorMessage: string | null;
  hasVideoFrame: boolean;
  hasAudioTrack: boolean;
  isAudioActive: boolean;
  audioPlaybackState: WebRTCAudioPlaybackState;
  audioDiagnosticMessage: string;
  firstFrameLatencyMs: number | null;
  signalingTimings: WebRTCSignalingTimings;
  audioStats: WebRTCAudioStats;
  iceCandidateStats?: WebRTCIceCandidateStats;
}

export interface WebRTCPlayerProps {
  whepUrl: string | null;
  streamId?: string;
  title?: string;
  isOnline?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  showDiagnostics?: boolean;
  className?: string;
  onStatusChange?: (snapshot: WebRTCPlaybackSnapshot) => void;
}

export type HLSFallbackStatus = "idle" | "loading" | "playing" | "error";
export type HLSPlaybackMode = "hlsjs" | "native" | "unsupported";
export type HLSLatencyMode = "low-latency" | "stable";

export interface HLSFallbackSnapshot {
  status: HLSFallbackStatus;
  mode: HLSPlaybackMode;
  latencyMode: HLSLatencyMode;
  errorMessage: string | null;
  webCodecs?: {
    supported: boolean;
    reason: "ready" | "missing-video-decoder" | "missing-video-frame";
  };
}

export interface HLSFallbackPlayerProps {
  hlsUrl: string | null;
  streamId?: string;
  title?: string;
  fallbackReason?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  showDiagnostics?: boolean;
  preload?: HTMLVideoElement["preload"];
  latencyMode?: HLSLatencyMode;
  poster?: string;
  className?: string;
  onStatusChange?: (snapshot: HLSFallbackSnapshot) => void;
}
