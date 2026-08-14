import type { WebRTCAudioPlaybackState, WebRTCPlaybackStatus } from "@streaming/types";

export const WHEP_PLAYBACK_ACTION = {
  loading: "loading",
  playing: "playing",
  offline: "offline",
  unsupported: "unsupported",
  error: "error",
  connection: "connection",
  firstFrame: "first-frame",
  audioState: "audio-state",
  audioPlayback: "audio-playback",
  audioLevel: "audio-level",
  audioStats: "audio-stats",
  iceCandidate: "ice-candidate",
  signalingTiming: "signaling-timing",
} as const;

export const WHEP_PLAYBACK_STATUS = {
  idle: "idle",
  loading: "loading",
  playing: "playing",
  error: "error",
  offline: "offline",
} as const satisfies Record<WebRTCPlaybackStatus, WebRTCPlaybackStatus>;

export const WHEP_AUDIO_PLAYBACK_STATE = {
  noTrack: "no-track",
  receiving: "receiving",
  trackMuted: "track-muted",
  playbackBlocked: "playback-blocked",
} as const satisfies Record<string, WebRTCAudioPlaybackState>;

export const WHEP_CONNECTION_STATE = {
  new: "new",
  closed: "closed",
  unsupported: "unsupported",
} as const;

export const WHEP_PLAYBACK_MESSAGE = {
  missingUrl: "WHEP URL is required",
  failed: "WebRTC playback failed",
  noAudioTrack: "오디오 트랙 없음",
} as const;

export type WhepPlaybackActionType =
  (typeof WHEP_PLAYBACK_ACTION)[keyof typeof WHEP_PLAYBACK_ACTION];
