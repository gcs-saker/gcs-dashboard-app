import type { WebRTCPlaybackSnapshot } from "@streaming/types";
import {
  EMPTY_AUDIO_STATS,
  EMPTY_ICE_CANDIDATE_STATS,
  EMPTY_SIGNALING_TIMINGS,
  type PlaybackAction,
} from "@streaming/hooks/playback/whepPlaybackContracts";
import {
  WHEP_AUDIO_PLAYBACK_STATE,
  WHEP_CONNECTION_STATE,
  WHEP_PLAYBACK_ACTION,
  WHEP_PLAYBACK_MESSAGE,
  WHEP_PLAYBACK_STATUS,
} from "@streaming/hooks/playback/whepPlaybackStateContract";
import {
  toAudioLevelState,
  toAudioPlaybackState,
  toAudioStatsState,
  toAudioTrackState,
  toConnectionState,
  toErrorState,
  toIceCandidateState,
  toPlayingState,
  toSignalingTimingState,
} from "@streaming/hooks/playback/whepPlaybackTransitions";

export const initialPlaybackState: WebRTCPlaybackSnapshot = {
  status: WHEP_PLAYBACK_STATUS.idle,
  connectionState: WHEP_CONNECTION_STATE.new,
  iceConnectionState: WHEP_CONNECTION_STATE.new,
  errorMessage: null,
  hasVideoFrame: false,
  hasAudioTrack: false,
  isAudioActive: false,
  audioPlaybackState: WHEP_AUDIO_PLAYBACK_STATE.noTrack,
  audioDiagnosticMessage: WHEP_PLAYBACK_MESSAGE.noAudioTrack,
  firstFrameLatencyMs: null,
  signalingTimings: EMPTY_SIGNALING_TIMINGS,
  audioStats: EMPTY_AUDIO_STATS,
  iceCandidateStats: EMPTY_ICE_CANDIDATE_STATS,
};

type LifecyclePlaybackAction = Extract<PlaybackAction, {
  type:
    | typeof WHEP_PLAYBACK_ACTION.loading
    | typeof WHEP_PLAYBACK_ACTION.playing
    | typeof WHEP_PLAYBACK_ACTION.offline
    | typeof WHEP_PLAYBACK_ACTION.unsupported
    | typeof WHEP_PLAYBACK_ACTION.error
    | typeof WHEP_PLAYBACK_ACTION.connection;
}>;
type MediaPlaybackAction = Exclude<PlaybackAction, LifecyclePlaybackAction>;
const LIFECYCLE_ACTIONS = new Set<PlaybackAction["type"]>([
  WHEP_PLAYBACK_ACTION.loading,
  WHEP_PLAYBACK_ACTION.playing,
  WHEP_PLAYBACK_ACTION.offline,
  WHEP_PLAYBACK_ACTION.unsupported,
  WHEP_PLAYBACK_ACTION.error,
  WHEP_PLAYBACK_ACTION.connection,
]);

export function playbackReducer(
  state: WebRTCPlaybackSnapshot,
  action: PlaybackAction,
): WebRTCPlaybackSnapshot {
  return isLifecycleAction(action) ? reduceLifecycleAction(state, action) : reduceMediaAction(state, action);
}

function isLifecycleAction(action: PlaybackAction): action is LifecyclePlaybackAction {
  return LIFECYCLE_ACTIONS.has(action.type);
}

function reduceLifecycleAction(
  state: WebRTCPlaybackSnapshot,
  action: LifecyclePlaybackAction,
): WebRTCPlaybackSnapshot {
  switch (action.type) {
    case WHEP_PLAYBACK_ACTION.loading:
      return {
        ...initialPlaybackState,
        status: WHEP_PLAYBACK_STATUS.loading,
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
      };
    case WHEP_PLAYBACK_ACTION.playing:
      return toPlayingState(state, action);
    case WHEP_PLAYBACK_ACTION.offline:
      return {
        ...initialPlaybackState,
        status: WHEP_PLAYBACK_STATUS.offline,
        connectionState: WHEP_CONNECTION_STATE.closed,
        iceConnectionState: WHEP_CONNECTION_STATE.closed,
      };
    case WHEP_PLAYBACK_ACTION.unsupported:
      return {
        ...initialPlaybackState,
        status: WHEP_PLAYBACK_STATUS.error,
        connectionState: WHEP_CONNECTION_STATE.unsupported,
        iceConnectionState: WHEP_CONNECTION_STATE.unsupported,
        errorMessage: action.message,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
        iceCandidateStats: state.iceCandidateStats,
      };
    case WHEP_PLAYBACK_ACTION.error:
      return toErrorState(state, action);
    case WHEP_PLAYBACK_ACTION.connection:
      return toConnectionState(state, action);
  }
}

function reduceMediaAction(
  state: WebRTCPlaybackSnapshot,
  action: MediaPlaybackAction,
): WebRTCPlaybackSnapshot {
  switch (action.type) {
    case WHEP_PLAYBACK_ACTION.firstFrame:
      return {
        ...state,
        hasVideoFrame: true,
        firstFrameLatencyMs: Math.max(0, Math.round(action.latencyMs)),
      };
    case WHEP_PLAYBACK_ACTION.audioState:
      return toAudioTrackState(state, action);
    case WHEP_PLAYBACK_ACTION.audioPlayback:
      return toAudioPlaybackState(state, action);
    case WHEP_PLAYBACK_ACTION.audioLevel:
      return toAudioLevelState(state, action);
    case WHEP_PLAYBACK_ACTION.audioStats:
      return toAudioStatsState(state, action);
    case WHEP_PLAYBACK_ACTION.iceCandidate:
      return toIceCandidateState(state, action);
    case WHEP_PLAYBACK_ACTION.signalingTiming:
      return toSignalingTimingState(state, action);
  }
}
