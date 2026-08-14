export type FailureSmokeAutomation = "frontend-test" | "backend-test" | "browser-smoke" | "manual-staging";

export interface FailureSmokeScenario {
  id: string;
  title: string;
  trigger: string;
  expectedUserState: string;
  containment: string;
  automation: FailureSmokeAutomation[];
}

export const FAILURE_SMOKE_SCENARIOS: readonly FailureSmokeScenario[] = [
  {
    id: "backend-api-down",
    title: "Backend API timeout/down",
    trigger: "Stop backend or make playback API fetch reject.",
    expectedUserState: "Realtime player shows an error alert instead of hanging on loading.",
    containment: "The player panel owns the error; dashboard shell and other widgets keep rendering.",
    automation: ["frontend-test", "browser-smoke", "manual-staging"],
  },
  {
    id: "playback-api-failure",
    title: "Playback API returns non-2xx",
    trigger: "Request an unregistered stream or return 404/503 from playback API.",
    expectedUserState: "Realtime player shows the playback API status message.",
    containment: "No retry storm is created for permanent API errors.",
    automation: ["frontend-test", "backend-test"],
  },
  {
    id: "mediamtx-down",
    title: "MediaMTX down or playback media fetch fails",
    trigger: "Keep backend running but stop MediaMTX or point playback URLs at a closed port.",
    expectedUserState: "WebRTC transitions through reconnecting, then HLS fallback or an explicit media error.",
    containment: "Media failure remains inside the stream component and does not crash dashboard layout.",
    automation: ["frontend-test", "browser-smoke", "manual-staging"],
  },
  {
    id: "redis-cache-down",
    title: "Redis cache/session support degraded",
    trigger: "Stop Redis or point media-control Redis address at a closed port while MediaMTX stays reachable.",
    expectedUserState: "Dashboard remains usable and stream discovery falls back to the upstream registry.",
    containment: "Redis failure must not hide healthy streams or crash polling loops.",
    automation: ["backend-test", "manual-staging"],
  },
  {
    id: "turn-cluster-down",
    title: "No healthy TURN/ICE server candidates",
    trigger: "Make primary and secondary TURN probes fail or return no healthy ICE servers.",
    expectedUserState: "Server status marks signaling degraded while API liveness remains visible.",
    containment: "TURN failure is isolated to connection setup and does not block authenticated dashboard access.",
    automation: ["frontend-test", "backend-test", "browser-smoke", "manual-staging"],
  },
  {
    id: "runtime-restart",
    title: "Service restart readiness transition",
    trigger: "Restart backend, media-control, or MediaMTX and poll health/readiness during startup.",
    expectedUserState: "Status panels move from degraded/error back to online without requiring a page reload.",
    containment: "Restart recovery must not leave stale stream cards permanently online.",
    automation: ["browser-smoke", "manual-staging"],
  },
  {
    id: "mock-ai-failure",
    title: "Mock AI endpoint failure",
    trigger: "Return 5xx from mock AI endpoint while the source stream stays available.",
    expectedUserState: "AI result panel can show degraded/error while source stream remains usable.",
    containment: "AI result failure must not block stream playback.",
    automation: ["manual-staging"],
  },
] as const;

export function requiredFailureSmokeScenarioIds(): string[] {
  return FAILURE_SMOKE_SCENARIOS.map((scenario) => scenario.id);
}

export function browserSmokeScenarioIds(): string[] {
  return FAILURE_SMOKE_SCENARIOS.filter((scenario) => scenario.automation.includes("browser-smoke")).map(
    (scenario) => scenario.id,
  );
}
