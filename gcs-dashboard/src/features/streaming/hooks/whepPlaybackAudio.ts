import type { Dispatch } from "react";

import type { WebRTCAudioStats, WebRTCPlaybackSnapshot } from "../types";
import { EMPTY_AUDIO_STATS, type PlaybackAction } from "./whepPlaybackContracts";

const AUDIO_STATE_POLL_INTERVAL_MS = 500;
const AUDIO_INACTIVE_HOLD_MS = 1200;
const AUDIO_STATS_POLL_INTERVAL_MS = 1000;
const AUDIO_ANALYSIS_FFT_SIZE = 256;
const AUDIO_ANALYSIS_UPDATE_INTERVAL_MS = 120;
const AUDIO_ANALYSIS_MIN_DELTA = 0.01;
const AUDIO_ANALYSIS_GAIN = 4;

export function audioPlaybackDiagnostic(
  hasAudioTrack: boolean,
  isAudioActive: boolean,
  playbackBlocked: boolean,
): Pick<WebRTCPlaybackSnapshot, "audioPlaybackState" | "audioDiagnosticMessage"> {
  if (playbackBlocked) {
    return {
      audioPlaybackState: "playback-blocked",
      audioDiagnosticMessage: "브라우저 자동재생 정책으로 오디오 재생이 차단됨",
    };
  }
  if (!hasAudioTrack) {
    return {
      audioPlaybackState: "no-track",
      audioDiagnosticMessage: "오디오 트랙 없음",
    };
  }
  if (!isAudioActive) {
    return {
      audioPlaybackState: "track-muted",
      audioDiagnosticMessage: "오디오 트랙 수신 중이나 무음 또는 mute 상태",
    };
  }
  return {
    audioPlaybackState: "receiving",
    audioDiagnosticMessage: "오디오 수신 중",
  };
}

export function monitorAudioStats(peerConnection: RTCPeerConnection, dispatch: Dispatch<PlaybackAction>): () => void {
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

export function monitorAudioState(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
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

export function monitorAudioLevel(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
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

export function audioStatsEqual(left: WebRTCAudioStats, right: WebRTCAudioStats): boolean {
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
