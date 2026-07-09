export const DASHBOARD_SERVER_HEALTH = Object.freeze({
  online: "online",
  degraded: "degraded",
  error: "error",
} as const);

export type DashboardServerHealth =
  (typeof DASHBOARD_SERVER_HEALTH)[keyof typeof DASHBOARD_SERVER_HEALTH];

export const DASHBOARD_STREAM_STATUS = Object.freeze({
  online: "online",
  fallback: "fallback",
  offline: "offline",
  error: "error",
  reconnecting: "reconnecting",
  degraded: "degraded",
} as const);

export type DashboardStreamStatus =
  (typeof DASHBOARD_STREAM_STATUS)[keyof typeof DASHBOARD_STREAM_STATUS];

export const DASHBOARD_STREAM_MODE = Object.freeze({
  eo: "EO",
  ir: "IR",
  ai: "AI",
  map: "MAP",
} as const);

export type DashboardStreamMode =
  (typeof DASHBOARD_STREAM_MODE)[keyof typeof DASHBOARD_STREAM_MODE];

export const DASHBOARD_GEOMETRY_SOURCE = Object.freeze({
  mock: "mock",
  registry: "registry",
  telemetry: "telemetry",
  device: "device",
} as const);

export type DashboardGeometrySource =
  (typeof DASHBOARD_GEOMETRY_SOURCE)[keyof typeof DASHBOARD_GEOMETRY_SOURCE];

export const DASHBOARD_QUERY_KEYS = Object.freeze({
  serverStatus: ["dashboard", "server-status"],
  operationalEvents: ["dashboard", "operational-events"],
  operationalEventMetrics: ["dashboard", "operational-event-metrics"],
  operationalEventBuckets: ["dashboard", "operational-event-buckets"],
  serverHealthSnapshots: ["dashboard", "server-health-snapshots"],
  streamSessions: ["dashboard", "stream-sessions"],
  telemetryHistory: ["dashboard", "telemetry-history"],
  timeSyncStatus: ["dashboard", "time-sync-status"],
  streams: ["dashboard", "streams"],
  iceServers: ["streaming", "ice-servers"],
} as const);

type QueryFilter = Readonly<Record<string, unknown>>;

export const DASHBOARD_QUERY_KEY_FACTORY = Object.freeze({
  serverStatus: (refreshMs: number, fetcherMode: "default-fetcher" | "custom-fetcher") =>
    [...DASHBOARD_QUERY_KEYS.serverStatus, { refreshMs, fetcherMode }] as const,
  operationalEvents: (filters: QueryFilter) =>
    [...DASHBOARD_QUERY_KEYS.operationalEvents, filters] as const,
  operationalEventMetrics: (filters: QueryFilter) =>
    [...DASHBOARD_QUERY_KEYS.operationalEventMetrics, filters] as const,
} as const);
