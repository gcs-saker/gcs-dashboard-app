import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, RefObject } from "react";

import { WEBRTC_ICE_SERVERS } from "../../../config";
import { loadWebRtcIceServers } from "../iceServers";
import type {
  WebRTCAudioStats,
  WebRTCPlaybackSnapshot,
  WebRTCPlaybackStatus,
  WebRTCSignalingTimings,
} from "../types";

type PeerConnectionFactory = () => RTCPeerConnection;
type SignalingTimingKey = keyof WebRTCSignalingTimings;
type SignalingTimingRecorder = (stage: SignalingTimingKey) => void;

const ICE_GATHERING_TIMEOUT_MS = 2500;
const WHEP_READY_RETRY_STATUS_CODES = new Set([404, 409, 425, 503]);
const WHEP_READY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const AUDIO_STATE_POLL_INTERVAL_MS = 500;
const AUDIO_INACTIVE_HOLD_MS = 1200;
const AUDIO_STATS_POLL_INTERVAL_MS = 1000;
const AUDIO_ANALYSIS_FFT_SIZE = 256;
const AUDIO_ANALYSIS_UPDATE_INTERVAL_MS = 120;
const AUDIO_ANALYSIS_MIN_DELTA = 0.01;
const AUDIO_ANALYSIS_GAIN = 4;
const DIRECT_FIRST_RTC_CONFIGURATION = Object.freeze({
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 0,
  iceTransportPolicy: "all",
} satisfies Omit<RTCConfiguration, "iceServers">);
const EMPTY_SIGNALING_TIMINGS: WebRTCSignalingTimings = {
  iceServersLoadedMs: null,
  offerCreatedMs: null,
  localDescriptionSetMs: null,
  iceGatheringDoneMs: null,
  whepResponseMs: null,
  remoteDescriptionSetMs: null,
};
const EMPTY_AUDIO_STATS: WebRTCAudioStats = {
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

interface UseWhepPlaybackOptions {
  whepUrl: string | null;
  isOnline?: boolean;
  peerConnectionFactory?: PeerConnectionFactory;
  fetcher?: typeof fetch;
}

type PlaybackAction =
  | { type: "loading"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "playing"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "offline" }
  | { type: "unsupported"; message: string }
  | { type: "error"; message: string; connectionState?: RTCPeerConnectionState; iceConnectionState?: RTCIceConnectionState }
  | { type: "connection"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "first-frame"; latencyMs: number }
  | { type: "audio-state"; hasAudioTrack: boolean; isAudioActive: boolean }
  | { type: "audio-level"; audioLevel: number | null }
  | { type: "audio-stats"; stats: WebRTCAudioStats }
  | { type: "signaling-timing"; stage: SignalingTimingKey; latencyMs: number };

class WhepHttpError extends Error {
  constructor(readonly status: number) {
    super(`WHEP request failed with ${status}`);
  }
}

const initialPlaybackState: WebRTCPlaybackSnapshot = {
  status: "idle",
  connectionState: "new",
  iceConnectionState: "new",
  errorMessage: null,
  hasVideoFrame: false,
  hasAudioTrack: false,
  isAudioActive: false,
  firstFrameLatencyMs: null,
  signalingTimings: EMPTY_SIGNALING_TIMINGS,
  audioStats: EMPTY_AUDIO_STATS,
};

export function useWhepPlayback({
  whepUrl,
  isOnline = true,
  peerConnectionFactory,
  fetcher = fetch,
}: UseWhepPlaybackOptions): WebRTCPlaybackSnapshot & { videoRef: RefObject<HTMLVideoElement | null> } {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [snapshot, dispatch] = useReducer(playbackReducer, initialPlaybackState);

  useEffect(() => {
    if (!isOnline) {
      dispatch({ type: "offline" });
      return;
    }

    if (!whepUrl) {
      dispatch({ type: "error", message: "WHEP URL is required" });
      return;
    }

    const resolvedWhepUrl = whepUrl;
    let peerConnection: RTCPeerConnection | null = null;
    const abortController = new AbortController();
    let disposed = false;
    let stopAudioMonitor: (() => void) | null = null;
    let stopAudioLevelMonitor: (() => void) | null = null;
    let stopAudioStatsMonitor: (() => void) | null = null;
    const startedAt = performance.now();
    const recordTiming: SignalingTimingRecorder = (stage) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: "signaling-timing", stage, latencyMs: performance.now() - startedAt });
    };

    const videoElement = videoRef.current;
    const handleFirstFrame = () => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: "first-frame", latencyMs: performance.now() - startedAt });
    };
    videoElement?.addEventListener("loadeddata", handleFirstFrame, { once: true });

    dispatch({
      type: "loading",
      connectionState: "new",
      iceConnectionState: "new",
    });

    void startWhepPlayback().catch((error) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "WebRTC playback failed",
        connectionState: peerConnection?.connectionState,
        iceConnectionState: peerConnection?.iceConnectionState,
      });
    });

    async function startWhepPlayback(): Promise<void> {
      reportWhepDebug("start", resolvedWhepUrl);
      const iceServers = peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(fetcher);
      if (disposed || abortController.signal.aborted) return;
      recordTiming("iceServersLoadedMs");
      reportWhepDebug("ice-loaded", resolvedWhepUrl, { count: String(iceServers.length) });

      try {
        peerConnection = peerConnectionFactory?.() ?? createPeerConnection(iceServers, resolvedWhepUrl);
        reportWhepDebug("pc-created", resolvedWhepUrl);
      } catch (error) {
        reportWhepDebug("pc-error", resolvedWhepUrl, { message: messageFromUnknown(error) });
        dispatch({
          type: "unsupported",
          message: error instanceof Error ? error.message : "WebRTC is not supported",
        });
        return;
      }

      dispatch({
        type: "loading",
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerConnection.addTransceiver("audio", { direction: "recvonly" });

      peerConnection.ontrack = (event) => {
        if (!videoRef.current) return;

        const [stream] = event.streams;
        if (stream) {
          stopAudioMonitor?.();
          stopAudioLevelMonitor?.();
          stopAudioMonitor = monitorAudioState(stream, dispatch);
          stopAudioLevelMonitor = monitorAudioLevel(stream, dispatch);
          videoRef.current.srcObject = stream;
          requestVideoPlayback(videoRef.current);
          return;
        }

        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
        stopAudioMonitor?.();
        stopAudioLevelMonitor?.();
        stopAudioMonitor = monitorAudioState(remoteStreamRef.current, dispatch);
        stopAudioLevelMonitor = monitorAudioLevel(remoteStreamRef.current, dispatch);
        videoRef.current.srcObject = remoteStreamRef.current;
        requestVideoPlayback(videoRef.current);
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection) {
          dispatchStateFromConnection(peerConnection, dispatch);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection) {
          dispatchStateFromConnection(peerConnection, dispatch);
        }
      };

      stopAudioStatsMonitor = monitorAudioStats(peerConnection, dispatch);
      await connectWithWhep(peerConnection, resolvedWhepUrl, fetcher, abortController.signal, recordTiming);
    }

    return () => {
      disposed = true;
      abortController.abort();
      peerConnection?.close();
      stopAudioMonitor?.();
      stopAudioLevelMonitor?.();
      stopAudioStatsMonitor?.();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      remoteStreamRef.current = null;
      videoElement?.removeEventListener("loadeddata", handleFirstFrame);
    };
  }, [fetcher, isOnline, peerConnectionFactory, whepUrl]);

  return { ...snapshot, videoRef };
}

function playbackReducer(
  state: WebRTCPlaybackSnapshot,
  action: PlaybackAction,
): WebRTCPlaybackSnapshot {
  switch (action.type) {
    case "loading":
      return {
        status: "loading",
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
        errorMessage: null,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
        audioStats: EMPTY_AUDIO_STATS,
      };
    case "playing":
      return {
        status: "playing",
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
        errorMessage: null,
        hasVideoFrame: state.hasVideoFrame,
        hasAudioTrack: state.hasAudioTrack,
        isAudioActive: state.isAudioActive,
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
      };
    case "offline":
      return {
        status: "offline",
        connectionState: "closed",
        iceConnectionState: "closed",
        errorMessage: null,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
        audioStats: EMPTY_AUDIO_STATS,
      };
    case "unsupported":
      return {
        status: "error",
        connectionState: "unsupported",
        iceConnectionState: "unsupported",
        errorMessage: action.message,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        firstFrameLatencyMs: null,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
      };
    case "error":
      return {
        status: "error",
        connectionState: action.connectionState ?? state.connectionState,
        iceConnectionState: action.iceConnectionState ?? state.iceConnectionState,
        errorMessage: action.message,
        hasVideoFrame: state.hasVideoFrame,
        hasAudioTrack: state.hasAudioTrack,
        isAudioActive: state.isAudioActive,
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
      };
    case "connection":
      return {
        ...state,
        status: statusFromConnection(action.connectionState, action.iceConnectionState, state.status),
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
      };
    case "first-frame":
      return {
        ...state,
        hasVideoFrame: true,
        firstFrameLatencyMs: Math.max(0, Math.round(action.latencyMs)),
      };
    case "audio-state":
      if (
        state.hasAudioTrack === action.hasAudioTrack &&
        state.isAudioActive === action.isAudioActive
      ) {
        return state;
      }
      return {
        ...state,
        hasAudioTrack: action.hasAudioTrack,
        isAudioActive: action.isAudioActive,
      };
    case "audio-level": {
      if (state.audioStats.audioLevel === action.audioLevel) {
        return state;
      }
      return {
        ...state,
        audioStats: {
          ...state.audioStats,
          audioLevel: action.audioLevel,
        },
      };
    }
    case "audio-stats": {
      const mergedStats = {
        ...action.stats,
        audioLevel: action.stats.audioLevel ?? state.audioStats.audioLevel,
      };
      if (audioStatsEqual(state.audioStats, mergedStats)) {
        return state;
      }
      return {
        ...state,
        audioStats: mergedStats,
      };
    }
    case "signaling-timing":
      return {
        ...state,
        signalingTimings: {
          ...state.signalingTimings,
          [action.stage]: Math.max(0, Math.round(action.latencyMs)),
        },
      };
  }
}

function monitorAudioStats(peerConnection: RTCPeerConnection, dispatch: Dispatch<PlaybackAction>): () => void {
  let disposed = false;
  let previousStats = EMPTY_AUDIO_STATS;

  const update = () => {
    if (typeof peerConnection.getStats !== "function") return;
    void peerConnection.getStats().then((report) => {
      if (disposed) return;
      const nextStats = extractAudioStats(report);
      if (audioStatsEqual(previousStats, nextStats)) return;
      previousStats = nextStats;
      dispatch({ type: "audio-stats", stats: nextStats });
    }).catch(() => undefined);
  };

  update();
  const intervalId = globalThis.setInterval(update, AUDIO_STATS_POLL_INTERVAL_MS);
  return () => {
    disposed = true;
    globalThis.clearInterval(intervalId);
    dispatch({ type: "audio-stats", stats: EMPTY_AUDIO_STATS });
  };
}

function extractAudioStats(report: RTCStatsReport): WebRTCAudioStats {
  let inboundAudio: Record<string, unknown> | null = null;
  let selectedPair: Record<string, unknown> | null = null;
  const statsById = new Map<string, Record<string, unknown>>();

  report.forEach((stat) => {
    const candidate = stat as unknown as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : null;
    if (id) statsById.set(id, candidate);
    if (
      candidate.type === "inbound-rtp" &&
      (candidate.kind === "audio" || candidate.mediaType === "audio")
    ) {
      inboundAudio = candidate;
    }
    if (
      candidate.type === "candidate-pair" &&
      (candidate.selected === true || candidate.nominated === true || candidate.state === "succeeded")
    ) {
      selectedPair = candidate;
    }
  });

  const localCandidate = candidateFromStats(statsById, selectedPair, "localCandidateId");
  const remoteCandidate = candidateFromStats(statsById, selectedPair, "remoteCandidateId");
  const emittedCount = numberStat(inboundAudio, "jitterBufferEmittedCount");
  const totalJitterBufferDelay = numberStat(inboundAudio, "jitterBufferDelay");
  const averageJitterBufferDelayMs =
    emittedCount !== null && emittedCount > 0 && totalJitterBufferDelay !== null
      ? totalJitterBufferDelay * 1000 / emittedCount
      : null;

  return {
    audioLevel: numberStat(inboundAudio, "audioLevel"),
    jitterMs: secondsToMs(numberStat(inboundAudio, "jitter")),
    jitterBufferDelayMs: roundNullable(averageJitterBufferDelayMs),
    packetsLost: numberStat(inboundAudio, "packetsLost"),
    packetsReceived: numberStat(inboundAudio, "packetsReceived"),
    concealedSamples: numberStat(inboundAudio, "concealedSamples"),
    roundTripTimeMs: secondsToMs(numberStat(selectedPair, "currentRoundTripTime")),
    localCandidateType: stringStat(localCandidate, "candidateType"),
    remoteCandidateType: stringStat(remoteCandidate, "candidateType"),
    transportProtocol: stringStat(localCandidate, "protocol") ?? stringStat(selectedPair, "protocol"),
    relayFallbackReason: relayFallbackReason(localCandidate, remoteCandidate),
  };
}

function candidateFromStats(
  statsById: Map<string, Record<string, unknown>>,
  selectedPair: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const candidateId = stringStat(selectedPair, key);
  return candidateId ? statsById.get(candidateId) ?? null : null;
}

function numberStat(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringStat(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function relayFallbackReason(
  localCandidate: Record<string, unknown> | null,
  remoteCandidate: Record<string, unknown> | null,
): string | null {
  if (stringStat(localCandidate, "candidateType") !== "relay") {
    return null;
  }
  const remoteType = stringStat(remoteCandidate, "candidateType");
  if (remoteType === "relay") {
    return "both-peers-relayed";
  }
  if (remoteType === "srflx") {
    return "local-direct-candidate-failed";
  }
  if (remoteType === "host") {
    return "local-nat-or-firewall-fallback";
  }
  return "relay-selected";
}

function secondsToMs(value: number | null): number | null {
  return value === null ? null : roundNullable(value * 1000);
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : Math.max(0, Math.round(value));
}

function audioStatsEqual(left: WebRTCAudioStats, right: WebRTCAudioStats): boolean {
  return (
    left.audioLevel === right.audioLevel &&
    left.jitterMs === right.jitterMs &&
    left.jitterBufferDelayMs === right.jitterBufferDelayMs &&
    left.packetsLost === right.packetsLost &&
    left.packetsReceived === right.packetsReceived &&
    left.concealedSamples === right.concealedSamples &&
    left.roundTripTimeMs === right.roundTripTimeMs &&
    left.localCandidateType === right.localCandidateType &&
    left.remoteCandidateType === right.remoteCandidateType &&
    left.transportProtocol === right.transportProtocol &&
    left.relayFallbackReason === right.relayFallbackReason
  );
}

function monitorAudioState(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
  const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
  let pendingInactiveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastEmitted = { hasAudioTrack: false, isAudioActive: false };

  const clearPendingInactive = () => {
    if (pendingInactiveTimer === null) return;
    globalThis.clearTimeout(pendingInactiveTimer);
    pendingInactiveTimer = null;
  };
  const emit = (next: { hasAudioTrack: boolean; isAudioActive: boolean }) => {
    if (
      lastEmitted.hasAudioTrack === next.hasAudioTrack &&
      lastEmitted.isAudioActive === next.isAudioActive
    ) {
      return;
    }
    lastEmitted = next;
    dispatch({ type: "audio-state", ...next });
  };
  const readAudioState = () => {
    const liveTracks = audioTracks.filter((track) => track.readyState !== "ended");
    return {
      hasAudioTrack: liveTracks.length > 0,
      isAudioActive: liveTracks.some((track) => track.enabled && !track.muted),
    };
  };
  const update = () => {
    const next = readAudioState();
    if (next.isAudioActive || !next.hasAudioTrack) {
      clearPendingInactive();
      emit(next);
      return;
    }

    if (lastEmitted.isAudioActive) {
      if (pendingInactiveTimer !== null) return;
      pendingInactiveTimer = globalThis.setTimeout(() => {
        pendingInactiveTimer = null;
        emit(readAudioState());
      }, AUDIO_INACTIVE_HOLD_MS);
      return;
    }

    emit(next);
  };

  update();
  const intervalId = globalThis.setInterval(update, AUDIO_STATE_POLL_INTERVAL_MS);
  for (const track of audioTracks) {
    track.addEventListener?.("mute", update);
    track.addEventListener?.("unmute", update);
    track.addEventListener?.("ended", update);
  }

  return () => {
    clearPendingInactive();
    globalThis.clearInterval(intervalId);
    for (const track of audioTracks) {
      track.removeEventListener?.("mute", update);
      track.removeEventListener?.("unmute", update);
      track.removeEventListener?.("ended", update);
    }
    dispatch({ type: "audio-state", hasAudioTrack: false, isAudioActive: false });
  };
}

function monitorAudioLevel(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
  const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
  if (audioTracks.length === 0) {
    dispatch({ type: "audio-level", audioLevel: null });
    return () => undefined;
  }

  const AudioContextConstructor = resolveAudioContextConstructor();
  if (!AudioContextConstructor) {
    return () => dispatch({ type: "audio-level", audioLevel: null });
  }

  let disposed = false;
  let animationFrameId: number | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let sampleBuffer: Uint8Array<ArrayBuffer> | null = null;
  let lastEmittedLevel: number | null = null;
  let lastSampledAt = 0;

  try {
    audioContext = new AudioContextConstructor();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = AUDIO_ANALYSIS_FFT_SIZE;
    analyserNode.smoothingTimeConstant = 0.72;
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyserNode);
    sampleBuffer = new Uint8Array(analyserNode.fftSize);
  } catch {
    dispatch({ type: "audio-level", audioLevel: null });
    return () => undefined;
  }

  const emitLevel = (audioLevel: number | null) => {
    if (
      lastEmittedLevel !== null &&
      audioLevel !== null &&
      Math.abs(lastEmittedLevel - audioLevel) < AUDIO_ANALYSIS_MIN_DELTA
    ) {
      return;
    }
    if (lastEmittedLevel === audioLevel) {
      return;
    }
    lastEmittedLevel = audioLevel;
    dispatch({ type: "audio-level", audioLevel });
  };

  const sampleAudioLevel = (sampledAt: number) => {
    if (disposed || !analyserNode || !sampleBuffer) return;
    animationFrameId = globalThis.requestAnimationFrame(sampleAudioLevel);
    if (sampledAt - lastSampledAt < AUDIO_ANALYSIS_UPDATE_INTERVAL_MS) return;
    lastSampledAt = sampledAt;
    analyserNode.getByteTimeDomainData(sampleBuffer);
    emitLevel(calculateRmsAudioLevel(sampleBuffer));
  };

  void audioContext.resume?.().catch(() => undefined);
  animationFrameId = globalThis.requestAnimationFrame(sampleAudioLevel);

  return () => {
    disposed = true;
    if (animationFrameId !== null) {
      globalThis.cancelAnimationFrame(animationFrameId);
    }
    sourceNode?.disconnect();
    analyserNode?.disconnect();
    void audioContext?.close?.().catch(() => undefined);
    dispatch({ type: "audio-level", audioLevel: null });
  };
}

function resolveAudioContextConstructor(): typeof AudioContext | null {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}

function calculateRmsAudioLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 128;
    const normalizedSample = (sample - 128) / 128;
    sumSquares += normalizedSample * normalizedSample;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return Math.min(1, roundAudioLevel(rms * AUDIO_ANALYSIS_GAIN));
}

function roundAudioLevel(value: number): number {
  return Math.round(value * 100) / 100;
}

function dispatchStateFromConnection(
  peerConnection: RTCPeerConnection,
  dispatch: Dispatch<PlaybackAction>,
): void {
  const connectionState = peerConnection.connectionState;
  const iceConnectionState = peerConnection.iceConnectionState;

  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    dispatch({ type: "playing", connectionState, iceConnectionState });
    return;
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
    dispatch({
      type: "error",
      message: `WebRTC connection interrupted (${connectionState}/${iceConnectionState})`,
      connectionState,
      iceConnectionState,
    });
    return;
  }

  dispatch({ type: "connection", connectionState, iceConnectionState });
}

function statusFromConnection(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
  fallbackStatus: WebRTCPlaybackStatus,
): WebRTCPlaybackStatus {
  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    return "playing";
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
    return "error";
  }

  return fallbackStatus === "idle" ? "loading" : fallbackStatus;
}

async function connectWithWhep(
  peerConnection: RTCPeerConnection,
  whepUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<void> {
  const offer = await peerConnection.createOffer();
  recordTiming("offerCreatedMs");
  reportWhepDebug("offer-created", whepUrl);
  await peerConnection.setLocalDescription(offer);
  recordTiming("localDescriptionSetMs");
  reportWhepDebug("local-description-set", whepUrl);
  await waitForIceGatheringComplete(peerConnection, signal, ICE_GATHERING_TIMEOUT_MS);
  recordTiming("iceGatheringDoneMs");
  reportWhepDebug("ice-wait-done", whepUrl, { state: peerConnection.iceGatheringState });

  if (signal.aborted) {
    reportWhepDebug("aborted-before-post", whepUrl);
    throw new Error("WebRTC playback was aborted");
  }

  const localDescription = peerConnection.localDescription;
  if (!localDescription?.sdp) {
    reportWhepDebug("missing-local-sdp", whepUrl);
    throw new Error("WebRTC local offer SDP was not created");
  }

  reportWhepDebug("whep-post-start", whepUrl, { candidates: String(countSdpCandidates(localDescription.sdp)) });
  const response = await postWhepOfferWithReadyRetry(whepUrl, localDescription.sdp, fetcher, signal, recordTiming);

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
  recordTiming("remoteDescriptionSetMs");
  reportWhepDebug("remote-description-set", whepUrl, { candidates: String(countSdpCandidates(answerSdp)) });
}

async function postWhepOfferWithReadyRetry(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      return await postWhepOffer(whepUrl, offerSdp, fetcher, signal, recordTiming);
    } catch (error) {
      if (!(error instanceof WhepHttpError) || !isRetryableWhepStatus(error.status) || attempt >= WHEP_READY_RETRY_DELAYS_MS.length) {
        throw error;
      }
      const delayMs = WHEP_READY_RETRY_DELAYS_MS[attempt];
      attempt += 1;
      reportWhepDebug("whep-ready-retry", whepUrl, { status: String(error.status), delayMs: String(delayMs) });
      await sleepUnlessAborted(delayMs, signal);
    }
  }
}

async function postWhepOffer(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  const response = await fetcher(whepUrl, {
    method: "POST",
    headers: {
      Accept: "application/sdp",
      "Content-Type": "application/sdp",
    },
    body: offerSdp,
    signal,
  });
  recordTiming("whepResponseMs");
  reportWhepDebug("whep-post-response", whepUrl, { status: String(response.status) });

  if (!response.ok) {
    throw new WhepHttpError(response.status);
  }

  return response;
}

function isRetryableWhepStatus(status: number): boolean {
  return WHEP_READY_RETRY_STATUS_CODES.has(status);
}

function sleepUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new Error("WebRTC playback was aborted"));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("WebRTC playback was aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let isResolved = false;
    const finish = () => {
      if (isResolved) return;
      isResolved = true;
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      peerConnection.onicegatheringstatechange = null;
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, timeoutMs);

    signal.addEventListener("abort", finish, { once: true });
    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };
  });
}

function createPeerConnection(iceServers: RTCIceServer[], whepUrl: string): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is not supported");
  }

  try {
    return new RTCPeerConnection({ ...DIRECT_FIRST_RTC_CONFIGURATION, iceServers });
  } catch (primaryError) {
    reportWhepDebug("pc-primary-config-failed", whepUrl, { message: messageFromUnknown(primaryError) });
  }

  try {
    return new RTCPeerConnection({ ...DIRECT_FIRST_RTC_CONFIGURATION, iceServers: WEBRTC_ICE_SERVERS });
  } catch (fallbackError) {
    reportWhepDebug("pc-fallback-config-failed", whepUrl, { message: messageFromUnknown(fallbackError) });
  }

  return new RTCPeerConnection();
}

function requestVideoPlayback(videoElement: HTMLVideoElement): void {
  try {
    const playResult = videoElement.play();
    void playResult?.catch(() => undefined);
  } catch {
    // Browser autoplay policy can reject programmatic playback; the peer connection still remains valid.
  }
}

function countSdpCandidates(sdp: string): number {
  return sdp.split(/\r?\n/).filter((line) => line.startsWith("a=candidate:")).length;
}

function reportWhepDebug(stage: string, whepUrl: string, fields: Record<string, string> = {}): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams({
    stage,
    stream: streamPathFromWhepUrl(whepUrl),
    ...fields,
  });
  const url = `/client-debug/webrtc?${params.toString()}`;

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    }
  } catch {
    // Debug reporting must never interrupt playback.
  }
}

function streamPathFromWhepUrl(whepUrl: string): string {
  try {
    const path = new URL(whepUrl, window.location.href).pathname;
    return path.replace(/^\/webrtc\//, "").replace(/\/whep$/, "");
  } catch {
    return "unknown";
  }
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160);
  return String(error).slice(0, 160);
}
