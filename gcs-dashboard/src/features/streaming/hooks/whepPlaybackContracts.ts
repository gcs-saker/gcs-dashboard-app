import type { WebRTCAudioStats, WebRTCIceCandidateStats, WebRTCSignalingTimings } from "../types";

export type PeerConnectionFactory = () => RTCPeerConnection;
export type SignalingTimingKey = keyof WebRTCSignalingTimings;
export type SignalingTimingRecorder = (stage: SignalingTimingKey) => void;

export type PlaybackAction =
  | { type: "loading"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "playing"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "offline" }
  | { type: "unsupported"; message: string }
  | { type: "error"; message: string; connectionState?: RTCPeerConnectionState; iceConnectionState?: RTCIceConnectionState }
  | { type: "connection"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "first-frame"; latencyMs: number }
  | { type: "audio-state"; hasAudioTrack: boolean; isAudioActive: boolean }
  | { type: "audio-playback"; blocked: boolean }
  | { type: "audio-level"; audioLevel: number | null }
  | { type: "audio-stats"; stats: WebRTCAudioStats }
  | { type: "ice-candidate"; candidate: RTCIceCandidate }
  | { type: "signaling-timing"; stage: SignalingTimingKey; latencyMs: number };

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
