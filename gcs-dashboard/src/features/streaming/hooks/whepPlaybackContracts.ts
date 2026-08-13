import type { WebRTCAudioStats, WebRTCIceCandidateStats, WebRTCSignalingTimings } from "@streaming/types";
import type { WHEP_PLAYBACK_ACTION } from "./whepPlaybackStateContract";

export type PeerConnectionFactory = () => RTCPeerConnection;
export type SignalingTimingKey = keyof WebRTCSignalingTimings;
export type SignalingTimingRecorder = (stage: SignalingTimingKey) => void;
type StopMonitor = () => void;

export interface WhepPlaybackSession {
  peerConnection: RTCPeerConnection | null;
  stopAudioMonitor: StopMonitor | null;
  stopAudioLevelMonitor: StopMonitor | null;
  stopAudioStatsMonitor: StopMonitor | null;
}

export type PlaybackAction =
  | {
      type: typeof WHEP_PLAYBACK_ACTION.loading;
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
    }
  | {
      type: typeof WHEP_PLAYBACK_ACTION.playing;
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
    }
  | { type: typeof WHEP_PLAYBACK_ACTION.offline }
  | { type: typeof WHEP_PLAYBACK_ACTION.unsupported; message: string }
  | {
      type: typeof WHEP_PLAYBACK_ACTION.error;
      message: string;
      connectionState?: RTCPeerConnectionState;
      iceConnectionState?: RTCIceConnectionState;
    }
  | {
      type: typeof WHEP_PLAYBACK_ACTION.connection;
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
    }
  | { type: typeof WHEP_PLAYBACK_ACTION.firstFrame; latencyMs: number }
  | { type: typeof WHEP_PLAYBACK_ACTION.audioState; hasAudioTrack: boolean; isAudioActive: boolean }
  | { type: typeof WHEP_PLAYBACK_ACTION.audioPlayback; blocked: boolean }
  | { type: typeof WHEP_PLAYBACK_ACTION.audioLevel; audioLevel: number | null }
  | { type: typeof WHEP_PLAYBACK_ACTION.audioStats; stats: WebRTCAudioStats }
  | { type: typeof WHEP_PLAYBACK_ACTION.iceCandidate; candidate: RTCIceCandidate }
  | { type: typeof WHEP_PLAYBACK_ACTION.signalingTiming; stage: SignalingTimingKey; latencyMs: number };

export const EMPTY_SIGNALING_TIMINGS: WebRTCSignalingTimings = {
  iceServersLoadedMs: null,
  offerCreatedMs: null,
  localDescriptionSetMs: null,
  iceGatheringDoneMs: null,
  whepResponseMs: null,
  remoteDescriptionSetMs: null,
};

export const EMPTY_AUDIO_STATS: WebRTCAudioStats = {
  audioLevel: null,
  jitterMs: null,
  jitterBufferDelayMs: null,
  packetsLost: null,
  packetsReceived: null,
  concealedSamples: null,
  roundTripTimeMs: null,
  localCandidateType: null,
  remoteCandidateType: null,
  transportProtocol: null,
  relayFallbackReason: null,
};

export const EMPTY_ICE_CANDIDATE_STATS: WebRTCIceCandidateStats = {
  total: 0,
  host: 0,
  srflx: 0,
  relay: 0,
  prflx: 0,
  unknown: 0,
  udp: 0,
  tcp: 0,
};
