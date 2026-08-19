import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

export function shouldSkipStreamRefresh(
  isMounted: boolean,
  stopped: boolean,
  inFlight: boolean,
  hidden: boolean,
): boolean {
  return !isMounted || stopped || inFlight || hidden;
}

export function markOnlineStreamsDegraded(streams: DashboardStreamSlot[]): DashboardStreamSlot[] {
  let changed = false;
  const next = streams.map((stream) => {
    if (stream.status !== "online") return stream;
    changed = true;
    return { ...stream, status: "degraded" as const };
  });
  return changed ? next : streams;
}
