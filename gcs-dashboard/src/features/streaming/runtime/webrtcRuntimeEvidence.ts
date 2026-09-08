import type { WebRTCPlaybackSnapshot } from "@streaming/types";

export type WebRTCIcePath = "direct" | "relay" | "unknown";

export interface WebRTCRuntimeEvidence {
  icePath: WebRTCIcePath;
  relaySelected: boolean;
  relayFallbackReason: string | null;
  directCandidateCount: number;
  relayCandidateCount: number;
  hasFirstFrame: boolean;
  firstFrameLatencyMs: number | null;
  whepResponseMs: number | null;
  roundTripTimeMs: number | null;
  signalingComplete: boolean;
}

const RELAY_CANDIDATE_TYPE = "relay";
const DIRECT_CANDIDATE_TYPES = new Set(["host", "srflx", "prflx"]);

export function buildWebRTCRuntimeEvidence(snapshot: WebRTCPlaybackSnapshot): WebRTCRuntimeEvidence {
  const localCandidateType = normalizeCandidateType(snapshot.audioStats.localCandidateType);
  const remoteCandidateType = normalizeCandidateType(snapshot.audioStats.remoteCandidateType);
  const candidateStats = snapshot.iceCandidateStats;
  const relaySelected = isRelaySelected(localCandidateType, remoteCandidateType, snapshot.audioStats.relayFallbackReason);
  const directCandidateCount = directCandidates(candidateStats, localCandidateType, remoteCandidateType);
  const relayCandidateCount = relayCandidates(candidateStats?.relay ?? 0, localCandidateType, remoteCandidateType);

  return {
    icePath: classifyIcePath(relaySelected, directCandidateCount),
    relaySelected,
    relayFallbackReason: snapshot.audioStats.relayFallbackReason,
    directCandidateCount,
    relayCandidateCount,
    hasFirstFrame: snapshot.hasVideoFrame && snapshot.firstFrameLatencyMs !== null,
    firstFrameLatencyMs: snapshot.firstFrameLatencyMs,
    whepResponseMs: snapshot.signalingTimings.whepResponseMs,
    roundTripTimeMs: snapshot.audioStats.roundTripTimeMs,
    signalingComplete: hasCompletedSignaling(snapshot),
  };
}

function isRelaySelected(local: string | null, remote: string | null, reason: string | null): boolean {
  return local === RELAY_CANDIDATE_TYPE || remote === RELAY_CANDIDATE_TYPE || reason !== null;
}

function directCandidates(
  stats: WebRTCPlaybackSnapshot["iceCandidateStats"],
  local: string | null,
  remote: string | null,
): number {
  const gathered = (stats?.host ?? 0) + (stats?.srflx ?? 0) + (stats?.prflx ?? 0);
  return gathered + Number(DIRECT_CANDIDATE_TYPES.has(local ?? "")) + Number(DIRECT_CANDIDATE_TYPES.has(remote ?? ""));
}

function relayCandidates(gathered: number, local: string | null, remote: string | null): number {
  return gathered + Number(local === RELAY_CANDIDATE_TYPE) + Number(remote === RELAY_CANDIDATE_TYPE);
}

function hasCompletedSignaling(snapshot: WebRTCPlaybackSnapshot): boolean {
  return snapshot.signalingTimings.whepResponseMs !== null && snapshot.signalingTimings.remoteDescriptionSetMs !== null;
}

function classifyIcePath(relaySelected: boolean, directCandidateCount: number): WebRTCIcePath {
  if (relaySelected) {
    return "relay";
  }
  if (directCandidateCount > 0) {
    return "direct";
  }
  return "unknown";
}

function normalizeCandidateType(candidateType: string | null): string | null {
  return candidateType === null ? null : candidateType.toLowerCase();
}
