import type { WebRTCIceCandidateStats } from "@streaming/types";

export function incrementIceCandidateStats(
  current: WebRTCIceCandidateStats,
  candidate: RTCIceCandidate,
): WebRTCIceCandidateStats {
  const candidateType = normalizeIceCandidateType(candidate.type);
  const protocol = normalizeIceCandidateProtocol(candidate.protocol, candidate.candidate);
  return {
    ...current,
    total: current.total + 1,
    [candidateType]: current[candidateType] + 1,
    ...(protocol ? { [protocol]: current[protocol] + 1 } : {}),
  };
}

function normalizeIceCandidateType(
  candidateType: RTCIceCandidateType | null | undefined,
): keyof Pick<WebRTCIceCandidateStats, "host" | "srflx" | "relay" | "prflx" | "unknown"> {
  if (candidateType === "host" || candidateType === "srflx" || candidateType === "relay" || candidateType === "prflx") {
    return candidateType;
  }
  return "unknown";
}

function normalizeIceCandidateProtocol(
  protocol: RTCIceProtocol | null | undefined,
  rawCandidate: string,
): keyof Pick<WebRTCIceCandidateStats, "udp" | "tcp"> | null {
  if (protocol === "udp" || protocol === "tcp") return protocol;
  const lowered = rawCandidate.toLowerCase();
  if (lowered.includes(" udp ")) return "udp";
  if (lowered.includes(" tcp ")) return "tcp";
  return null;
}
