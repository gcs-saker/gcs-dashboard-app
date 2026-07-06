import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { AudioAnalysisSnapshot } from "./dashboardPresentation";
import type { DashboardStreamSlot } from "./streamTypes";

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
    audioLevel: snapshot.audioLevel ?? null,
    firstFrameLatencyMs: snapshot.webrtcFirstFrameLatencyMs ?? null,
    whepResponseMs: snapshot.webrtcWhepResponseMs ?? null,
    jitterMs: snapshot.audioJitterMs ?? null,
    packetsLost: snapshot.audioPacketsLost ?? null,
    iceRoundTripTimeMs: snapshot.iceRoundTripTimeMs ?? null,
    localCandidateType: snapshot.localCandidateType ?? null,
    remoteCandidateType: snapshot.remoteCandidateType ?? null,
    iceTransportProtocol: snapshot.iceTransportProtocol ?? null,
    relayFallbackReason: snapshot.relayFallbackReason ?? null,
  };
}

export function isSameAudioAnalysis(
  current: AudioAnalysisSnapshot | null,
  next: AudioAnalysisSnapshot,
): boolean {
  return (
    current?.streamId === next.streamId &&
    current.title === next.title &&
    current.mode === next.mode &&
    current.streamStatus === next.streamStatus &&
    current.hasAudioTrack === next.hasAudioTrack &&
    current.isAudioActive === next.isAudioActive &&
    current.audioLevel === next.audioLevel &&
    current.firstFrameLatencyMs === next.firstFrameLatencyMs &&
    current.whepResponseMs === next.whepResponseMs &&
    current.jitterMs === next.jitterMs &&
    current.packetsLost === next.packetsLost &&
    current.iceRoundTripTimeMs === next.iceRoundTripTimeMs &&
    current.localCandidateType === next.localCandidateType &&
    current.remoteCandidateType === next.remoteCandidateType &&
    current.iceTransportProtocol === next.iceTransportProtocol &&
    current.relayFallbackReason === next.relayFallbackReason
  );
}
