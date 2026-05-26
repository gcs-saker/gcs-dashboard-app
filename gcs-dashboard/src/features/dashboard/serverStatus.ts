import { apiUrl } from "../../config";
import { buildAuthHeaders } from "../auth/authApi";

export type DashboardServerHealth = "online" | "degraded" | "error";

export interface DashboardServerStatusSnapshot {
  server: DashboardServerHealth;
  readiness: DashboardServerHealth;
  streams: DashboardServerHealth;
  latencyMs: number | null;
}

export const DEFAULT_SERVER_STATUS: DashboardServerStatusSnapshot = {
  server: "degraded",
  readiness: "degraded",
  streams: "degraded",
  latencyMs: null,
};

async function probe(fetcher: typeof fetch, path: string, headers?: Record<string, string>): Promise<Response> {
  return fetcher(apiUrl(path), { headers });
}

export async function fetchDashboardServerStatus(
  fetcher: typeof fetch = fetch,
): Promise<DashboardServerStatusSnapshot> {
  const startedAt = performance.now();
  try {
    const [healthResponse, readyResponse, streamResponse] = await Promise.all([
      probe(fetcher, "/healthz"),
      probe(fetcher, "/readyz"),
      probe(fetcher, "/api/v1/streams", buildAuthHeaders()),
    ]);
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));

    return {
      server: healthResponse.ok ? "online" : "error",
      readiness: readyResponse.ok ? "online" : "degraded",
      streams: streamResponse.ok ? "online" : "degraded",
      latencyMs,
    };
  } catch {
    return {
      server: "error",
      readiness: "error",
      streams: "error",
      latencyMs: null,
    };
  }
}

export function serverHealthText(health: DashboardServerHealth): string {
  switch (health) {
    case "online":
      return "정상";
    case "degraded":
      return "저하";
    case "error":
      return "오류";
  }
}
