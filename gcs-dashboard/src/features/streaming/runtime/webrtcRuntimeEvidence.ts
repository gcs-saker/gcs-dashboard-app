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
  const relaySelected =
    localCandidateType === RELAY_CANDIDATE_TYPE ||
    remoteCandidateType === RELAY_CANDIDATE_TYPE ||
    snapshot.audioStats.relayFallbackReason !== null;
  const directCandidateCount =
    (candidateStats?.host ?? 0) +
    (candidateStats?.srflx ?? 0) +
    (candidateStats?.prflx ?? 0) +
    (DIRECT_CANDIDATE_TYPES.has(localCandidateType ?? "") ? 1 : 0) +
    (DIRECT_CANDIDATE_TYPES.has(remoteCandidateType ?? "") ? 1 : 0);
  const relayCandidateCount =
    (candidateStats?.relay ?? 0) +
    (localCandidateType === RELAY_CANDIDATE_TYPE ? 1 : 0) +
    (remoteCandidateType === RELAY_CANDIDATE_TYPE ? 1 : 0);

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
    signalingComplete:
      snapshot.signalingTimings.whepResponseMs !== null &&
      snapshot.signalingTimings.remoteDescriptionSetMs !== null,
  };
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
