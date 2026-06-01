import { backendRootUrl, streamApiV1Url } from "../../config";
import { BACKEND_ROOT_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import { AuthApiError, authenticatedFetch } from "../auth/authApi";

export type DashboardServerHealth = "online" | "degraded" | "error";

export interface DashboardServerStatusSnapshot {
  apiServer: DashboardServerHealth;
  authServer: DashboardServerHealth;
  signalingServer: DashboardServerHealth;
  readiness: DashboardServerHealth;
  streams: DashboardServerHealth;
  latencyMs: number | null;
  checkedAt: number | null;
}

export const DEFAULT_SERVER_STATUS: DashboardServerStatusSnapshot = {
  apiServer: "degraded",
  authServer: "degraded",
  signalingServer: "degraded",
  readiness: "degraded",
  streams: "degraded",
  latencyMs: null,
  checkedAt: null,
};

async function probe(fetcher: typeof fetch, path: string, headers?: Record<string, string>): Promise<Response> {
  return fetcher(backendRootUrl(path), { headers });
}

export async function fetchDashboardServerStatus(
  fetcher: typeof fetch = fetch,
): Promise<DashboardServerStatusSnapshot> {
  const startedAt = performance.now();
  try {
    const [healthResponse, readyResponse, signalingResponse, streamResponse] = await Promise.all([
      probe(fetcher, BACKEND_ROOT_ROUTES.healthz),
      probe(fetcher, BACKEND_ROOT_ROUTES.readyz),
      probe(fetcher, BACKEND_ROOT_ROUTES.mediaControlHealthz),
      authenticatedFetch(streamApiV1Url(STREAM_API_ROUTES.streams), { headers: { Accept: "application/json" } }, fetcher),
    ]);
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    if (streamResponse.status === 401) {
      throw new AuthApiError(streamResponse.status, "stream status authentication required");
    }

    return {
      apiServer: streamResponse.ok ? healthFromLatency(latencyMs) : "degraded",
      authServer: healthResponse.ok && readyResponse.ok ? "online" : "degraded",
      signalingServer: signalingResponse.ok ? "online" : "degraded",
      readiness: readyResponse.ok ? "online" : "degraded",
      streams: streamResponse.ok ? "online" : "degraded",
      latencyMs,
      checkedAt: Date.now(),
    };
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      throw error;
    }
    return {
      apiServer: "error",
      authServer: "error",
      signalingServer: "error",
      readiness: "error",
      streams: "error",
      latencyMs: null,
      checkedAt: Date.now(),
    };
  }
}

export function healthFromLatency(latencyMs: number): DashboardServerHealth {
  if (latencyMs > 1200) return "error";
  if (latencyMs > 450) return "degraded";
  return "online";
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
