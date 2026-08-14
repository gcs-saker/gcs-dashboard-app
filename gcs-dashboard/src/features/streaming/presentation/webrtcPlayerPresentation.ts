import type {
  WebRTCAudioPlaybackState,
  WebRTCIceCandidateStats,
  WebRTCPlaybackStatus,
} from "@streaming/types";

export const WEBRTC_STATUS_LABELS: Record<WebRTCPlaybackStatus, string> = {
  idle: "idle",
  loading: "loading",
  playing: "playing",
  error: "error",
  offline: "offline",
} as const;

export const EMPTY_ICE_CANDIDATE_STATS: WebRTCIceCandidateStats = {
  total: 0,
  host: 0,
  srflx: 0,
  relay: 0,
  prflx: 0,
  unknown: 0,
  udp: 0,
  tcp: 0,
} as const;

export function audioDiagnosticLabel(audioPlaybackState: WebRTCAudioPlaybackState): string {
  if (audioPlaybackState === "receiving") return "audio receiving";
  if (audioPlaybackState === "track-muted") return "audio muted";
  if (audioPlaybackState === "playback-blocked") return "audio blocked";
  return "audio none";
}
