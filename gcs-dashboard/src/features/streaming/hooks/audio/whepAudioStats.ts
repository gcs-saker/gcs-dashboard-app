import type { WebRTCAudioStats } from "@streaming/types";

export function extractAudioStats(report: RTCStatsReport): WebRTCAudioStats {
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
