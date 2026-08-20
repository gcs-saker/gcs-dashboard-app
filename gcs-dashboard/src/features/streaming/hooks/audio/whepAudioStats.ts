import type { WebRTCAudioStats } from "@streaming/types";
import { haveEqualFields } from "@/features/valueEquality";

const AUDIO_STATS_FIELDS: readonly (keyof WebRTCAudioStats)[] = [
  "audioLevel", "jitterMs", "jitterBufferDelayMs", "packetsLost", "packetsReceived", "concealedSamples",
  "roundTripTimeMs", "localCandidateType", "remoteCandidateType", "transportProtocol", "relayFallbackReason",
];

export function extractAudioStats(report: RTCStatsReport): WebRTCAudioStats {
  const { inboundAudio, selectedPair, statsById } = indexAudioStats(report);
  const localCandidate = candidateFromStats(statsById, selectedPair, "localCandidateId");
  const remoteCandidate = candidateFromStats(statsById, selectedPair, "remoteCandidateId");

  return {
    audioLevel: numberStat(inboundAudio, "audioLevel"),
    jitterMs: secondsToMs(numberStat(inboundAudio, "jitter")),
    jitterBufferDelayMs: averageJitterBufferDelay(inboundAudio),
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

export interface AudioEnergySample {
  readonly totalAudioEnergy: number;
  readonly totalSamplesDuration: number;
}

export function extractAudioEnergySample(report: RTCStatsReport): AudioEnergySample | null {
  const { inboundAudio } = indexAudioStats(report);
  const totalAudioEnergy = numberStat(inboundAudio, "totalAudioEnergy");
  const totalSamplesDuration = numberStat(inboundAudio, "totalSamplesDuration");
  return totalAudioEnergy === null || totalSamplesDuration === null
    ? null
    : { totalAudioEnergy, totalSamplesDuration };
}

export function calculateAudioEnergyLevel(
  previous: AudioEnergySample | null,
  current: AudioEnergySample | null,
): number | null {
  if (!previous || !current) return null;
  const energyDelta = current.totalAudioEnergy - previous.totalAudioEnergy;
  const durationDelta = current.totalSamplesDuration - previous.totalSamplesDuration;
  if (energyDelta < 0 || durationDelta <= 0) return null;
  return Math.min(1, Math.sqrt(energyDelta / durationDelta));
}

export function extractAudioStatsWithEnergy(
  report: RTCStatsReport,
  previous: AudioEnergySample | null,
): { stats: WebRTCAudioStats; sample: AudioEnergySample | null } {
  const sample = extractAudioEnergySample(report);
  const stats = extractAudioStats(report);
  return {
    sample,
    stats: { ...stats, audioLevel: stats.audioLevel ?? calculateAudioEnergyLevel(previous, sample) },
  };
}

function indexAudioStats(report: RTCStatsReport) {
  let inboundAudio: Record<string, unknown> | null = null;
  let selectedPair: Record<string, unknown> | null = null;
  const statsById = new Map<string, Record<string, unknown>>();
  report.forEach((stat) => {
    const candidate = stat as unknown as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : null;
    if (id) statsById.set(id, candidate);
    if (isInboundAudio(candidate)) inboundAudio = candidate;
    if (isSelectedPair(candidate)) selectedPair = candidate;
  });
  return { inboundAudio, selectedPair, statsById };
}

function isInboundAudio(candidate: Record<string, unknown>): boolean {
  return candidate.type === "inbound-rtp" && (candidate.kind === "audio" || candidate.mediaType === "audio");
}

function isSelectedPair(candidate: Record<string, unknown>): boolean {
  return candidate.type === "candidate-pair" &&
    (candidate.selected === true || candidate.nominated === true || candidate.state === "succeeded");
}

function averageJitterBufferDelay(inboundAudio: Record<string, unknown> | null): number | null {
  const emitted = numberStat(inboundAudio, "jitterBufferEmittedCount");
  const delay = numberStat(inboundAudio, "jitterBufferDelay");
  return emitted !== null && emitted > 0 && delay !== null ? roundNullable(delay * 1000 / emitted) : null;
}

export function audioStatsEqual(left: WebRTCAudioStats, right: WebRTCAudioStats): boolean {
  return haveEqualFields(left, right, AUDIO_STATS_FIELDS);
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
