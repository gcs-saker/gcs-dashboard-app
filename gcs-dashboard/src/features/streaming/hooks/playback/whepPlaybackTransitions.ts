import type { WebRTCAudioStats, WebRTCPlaybackSnapshot } from "@streaming/types";
import { audioStatsEqual } from "@streaming/hooks/audio/whepAudioStats";
import { audioPlaybackDiagnostic } from "@streaming/hooks/audio/whepPlaybackAudio";
import {
  EMPTY_ICE_CANDIDATE_STATS,
  type PlaybackAction,
} from "@streaming/hooks/playback/whepPlaybackContracts";
import { statusFromConnection } from "@streaming/hooks/playback/whepConnectionState";
import { incrementIceCandidateStats } from "@streaming/hooks/playback/whepPlaybackIce";
import { WHEP_AUDIO_PLAYBACK_STATE, WHEP_PLAYBACK_STATUS } from "@streaming/hooks/playback/whepPlaybackStateContract";

export function toPlayingState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "playing" }>,
): WebRTCPlaybackSnapshot {
  return {
    ...state,
    status: WHEP_PLAYBACK_STATUS.playing,
    connectionState: action.connectionState,
    iceConnectionState: action.iceConnectionState,
    errorMessage: null,
  };
}

export function toErrorState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "error" }>,
): WebRTCPlaybackSnapshot {
  return {
    ...state,
    status: WHEP_PLAYBACK_STATUS.error,
    connectionState: action.connectionState ?? state.connectionState,
    iceConnectionState: action.iceConnectionState ?? state.iceConnectionState,
    errorMessage: action.message,
  };
}

export function toConnectionState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "connection" }>,
): WebRTCPlaybackSnapshot {
  return {
    ...state,
    status: statusFromConnection(action.connectionState, action.iceConnectionState, state.status),
    connectionState: action.connectionState,
    iceConnectionState: action.iceConnectionState,
  };
}

export function toAudioTrackState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "audio-state" }>,
): WebRTCPlaybackSnapshot {
  if (state.hasAudioTrack === action.hasAudioTrack && state.isAudioActive === action.isAudioActive) {
    return state;
  }
  return {
    ...state,
    hasAudioTrack: action.hasAudioTrack,
    isAudioActive: action.isAudioActive,
    ...audioPlaybackDiagnostic(
      action.hasAudioTrack,
      action.isAudioActive,
      state.audioPlaybackState === WHEP_AUDIO_PLAYBACK_STATE.playbackBlocked,
    ),
  };
}

export function toAudioPlaybackState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "audio-playback" }>,
): WebRTCPlaybackSnapshot {
  if ((state.audioPlaybackState === WHEP_AUDIO_PLAYBACK_STATE.playbackBlocked) === action.blocked) {
    return state;
  }
  return {
    ...state,
    ...audioPlaybackDiagnostic(state.hasAudioTrack, state.isAudioActive, action.blocked),
  };
}

export function toAudioLevelState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "audio-level" }>,
): WebRTCPlaybackSnapshot {
  return mergeAudioStats(state, { audioLevel: action.audioLevel });
}

export function toAudioStatsState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "audio-stats" }>,
): WebRTCPlaybackSnapshot {
  return mergeAudioStats(state, {
    ...action.stats,
    audioLevel: action.stats.audioLevel ?? state.audioStats.audioLevel,
  });
}

export function toIceCandidateState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "ice-candidate" }>,
): WebRTCPlaybackSnapshot {
  return {
    ...state,
    iceCandidateStats: incrementIceCandidateStats(
      state.iceCandidateStats ?? EMPTY_ICE_CANDIDATE_STATS,
      action.candidate,
    ),
  };
}

export function toSignalingTimingState(
  state: WebRTCPlaybackSnapshot,
  action: Extract<PlaybackAction, { type: "signaling-timing" }>,
): WebRTCPlaybackSnapshot {
  return {
    ...state,
    signalingTimings: {
      ...state.signalingTimings,
      [action.stage]: Math.max(0, Math.round(action.latencyMs)),
    },
  };
}

function mergeAudioStats(
  state: WebRTCPlaybackSnapshot,
  patch: Partial<WebRTCAudioStats>,
): WebRTCPlaybackSnapshot {
  const audioStats = { ...state.audioStats, ...patch };
  if (audioStatsEqual(state.audioStats, audioStats)) return state;
  return { ...state, audioStats };
}
