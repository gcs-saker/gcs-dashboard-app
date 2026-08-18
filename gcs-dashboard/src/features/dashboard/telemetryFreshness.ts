import type { DashboardStreamSlot } from "./streamTypes";

export type TelemetryFreshness = "fresh" | "stale" | "unavailable";

export const TELEMETRY_FRESHNESS_WINDOW_MS = 15_000;

export function telemetryFreshnessForStream(
  stream: Pick<DashboardStreamSlot, "geometry" | "status">,
  nowMs = Date.now(),
): TelemetryFreshness {
  const geometry = stream.geometry;
  if (!geometry || geometry.source !== "telemetry") return "unavailable";
  if (stream.status === "offline" || stream.status === "error") return "stale";
  if (geometry.telemetryStatus) return geometry.telemetryStatus;
  const observedAtMs = parseTelemetryTime(geometry.observedAt, nowMs);
  if (observedAtMs === null) return "stale";
  const ageMs = nowMs - observedAtMs;
  return ageMs >= 0 && ageMs <= TELEMETRY_FRESHNESS_WINDOW_MS ? "fresh" : "stale";
}

export function telemetryFreshnessFromObservedAt(value: string | undefined, nowMs = Date.now()): "fresh" | "stale" {
  const observedAtMs = parseTelemetryTime(value, nowMs);
  if (observedAtMs === null) return "stale";
  const ageMs = nowMs - observedAtMs;
  return ageMs >= 0 && ageMs <= TELEMETRY_FRESHNESS_WINDOW_MS ? "fresh" : "stale";
}

function parseTelemetryTime(value: string | undefined, nowMs: number): number | null {
  if (!value) return null;
  const absolute = Date.parse(value);
  if (!Number.isNaN(absolute)) return absolute;
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const now = new Date(nowMs);
  const candidate = new Date(now);
  candidate.setHours(Number(match[1]), Number(match[2]), Number(match[3]), Number((match[4] ?? "0").padEnd(3, "0")));
  return candidate.getTime();
}
