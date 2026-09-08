import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { haveEqualFields } from "@/features/valueEquality";

const AUDIO_ANALYSIS_FIELDS: readonly (keyof AudioAnalysisSnapshot)[] = [
  "streamId", "title", "mode", "streamStatus", "hasAudioTrack", "isAudioActive", "audioLevel",
  "firstFrameLatencyMs", "whepResponseMs", "jitterMs", "packetsLost", "iceRoundTripTimeMs",
  "localCandidateType", "remoteCandidateType", "iceTransportProtocol", "relayFallbackReason",
];

export function createAudioAnalysisSnapshot(
  streamId: string,
  snapshot: RealtimePlayerSnapshot,
  streams: DashboardStreamSlot[],
): AudioAnalysisSnapshot {
  const sourceStream = streams.find((stream) => stream.id === streamId);
  return {
    streamId,
    title: sourceStream?.title ?? streamId,
    mode: snapshot.mode,
    streamStatus: snapshot.streamStatus,
    hasAudioTrack: Boolean(snapshot.hasAudioTrack),
    isAudioActive: Boolean(snapshot.isAudioActive),
    audioLevel: nullableValue(snapshot.audioLevel),
    firstFrameLatencyMs: nullableValue(snapshot.webrtcFirstFrameLatencyMs),
    whepResponseMs: nullableValue(snapshot.webrtcWhepResponseMs),
    jitterMs: nullableValue(snapshot.audioJitterMs),
    packetsLost: nullableValue(snapshot.audioPacketsLost),
    iceRoundTripTimeMs: nullableValue(snapshot.iceRoundTripTimeMs),
    localCandidateType: nullableValue(snapshot.localCandidateType),
    remoteCandidateType: nullableValue(snapshot.remoteCandidateType),
    iceTransportProtocol: nullableValue(snapshot.iceTransportProtocol),
    relayFallbackReason: nullableValue(snapshot.relayFallbackReason),
  };
}

export function isSameAudioAnalysis(
  current: AudioAnalysisSnapshot | null,
  next: AudioAnalysisSnapshot,
): boolean {
  return current !== null && haveEqualFields(current, next, AUDIO_ANALYSIS_FIELDS);
}

function nullableValue<T>(value: T | null | undefined): T | null {
  return value ?? null;
}
