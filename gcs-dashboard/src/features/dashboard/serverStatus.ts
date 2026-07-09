import { backendRootUrl } from "@/config";
import { BACKEND_ROOT_ROUTES } from "@/features/apiRoutes";
import { DASHBOARD_SERVER_HEALTH, type DashboardServerHealth } from "@/features/stateContracts";

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
  apiServer: DASHBOARD_SERVER_HEALTH.degraded,
  authServer: DASHBOARD_SERVER_HEALTH.degraded,
  signalingServer: DASHBOARD_SERVER_HEALTH.degraded,
  readiness: DASHBOARD_SERVER_HEALTH.degraded,
  streams: DASHBOARD_SERVER_HEALTH.degraded,
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
    const [healthResponse, readyResponse, signalingResponse, signalingReadyResponse, streamResponse] = await Promise.all([
      probe(fetcher, BACKEND_ROOT_ROUTES.healthz),
      probe(fetcher, BACKEND_ROOT_ROUTES.readyz),
      probe(fetcher, BACKEND_ROOT_ROUTES.mediaControlHealthz),
      probe(fetcher, BACKEND_ROOT_ROUTES.mediaControlReadyz),
      probe(fetcher, BACKEND_ROOT_ROUTES.streamStatus),
    ]);
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));

    return {
      apiServer: streamResponse.ok ? healthFromLatency(latencyMs) : DASHBOARD_SERVER_HEALTH.degraded,
      authServer: healthResponse.ok && readyResponse.ok ? DASHBOARD_SERVER_HEALTH.online : DASHBOARD_SERVER_HEALTH.degraded,
      signalingServer:
        signalingResponse.ok && signalingReadyResponse.ok
          ? DASHBOARD_SERVER_HEALTH.online
          : DASHBOARD_SERVER_HEALTH.degraded,
      readiness: readyResponse.ok ? DASHBOARD_SERVER_HEALTH.online : DASHBOARD_SERVER_HEALTH.degraded,
      streams: streamResponse.ok ? DASHBOARD_SERVER_HEALTH.online : DASHBOARD_SERVER_HEALTH.degraded,
      latencyMs,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      apiServer: DASHBOARD_SERVER_HEALTH.error,
      authServer: DASHBOARD_SERVER_HEALTH.error,
      signalingServer: DASHBOARD_SERVER_HEALTH.error,
      readiness: DASHBOARD_SERVER_HEALTH.error,
      streams: DASHBOARD_SERVER_HEALTH.error,
      latencyMs: null,
      checkedAt: Date.now(),
    };
  }
}

export function healthFromLatency(latencyMs: number): DashboardServerHealth {
  if (latencyMs > 1200) return DASHBOARD_SERVER_HEALTH.error;
  if (latencyMs > 450) return DASHBOARD_SERVER_HEALTH.degraded;
  return DASHBOARD_SERVER_HEALTH.online;
}

export function serverHealthText(health: DashboardServerHealth): string {
  switch (health) {
    case DASHBOARD_SERVER_HEALTH.online:
      return "정상";
    case DASHBOARD_SERVER_HEALTH.degraded:
      return "저하";
    case DASHBOARD_SERVER_HEALTH.error:
      return "오류";
  }
}
