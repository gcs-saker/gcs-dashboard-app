export function reportWhepDebug(stage: string, whepUrl: string, fields: Record<string, string> = {}): void {
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

export function countSdpCandidates(sdp: string): number {
  return sdp.split(/\r?\n/).filter((line) => line.startsWith("a=candidate:")).length;
}

export function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160);
  return String(error).slice(0, 160);
}

function streamPathFromWhepUrl(whepUrl: string): string {
  try {
    const path = new URL(whepUrl, window.location.href).pathname;
    return path.replace(/^\/webrtc\//, "").replace(/\/whep$/, "");
  } catch {
    return "unknown";
  }
}
