export const AUTH_ROUTES = Object.freeze({
  login: "/login",
  refresh: "/refresh",
  logout: "/logout",
  signup: "/signup",
  me: "/me",
});

export const BACKEND_ROOT_ROUTES = Object.freeze({
  healthz: "/healthz",
  readyz: "/readyz",
  adminDevices: "/auth-policy/api/v1/devices",
  groups: "/auth-policy/api/v1/groups",
  provisioningTokens: "/auth-policy/api/v1/provisioning-tokens",
  signupTokens: "/auth-policy/api/v1/signup-tokens",
  mediaControlHealthz: "/media-control/healthz",
  mediaControlReadyz: "/media-control/readyz",
  streamStatus: "/stream/status",
});

export const DASHBOARD_API_ROUTES = Object.freeze({
  assetByGatewayPrefix: "/asset/",
  operationalEvents: "/ops/events",
  operationalEventsPage: "/ops/events/page",
  operationalEventsStream: "/ops/events/stream",
  operationalEventMetrics: "/ops/events/metrics",
  operationalEventBuckets: "/ops/events/buckets",
  serverHealthSnapshots: "/ops/server-health/snapshots",
  streamSessions: "/ops/stream-sessions",
  streamSessionsStream: "/ops/stream-sessions/stream",
  telemetryAll: "/telemetry/all",
  telemetryIngest: "/telemetry/",
  telemetryHistorySuffix: "/history",
  timeSyncStatus: "/ops/time/status",
  timeSyncCheck: "/ops/time/check",
  timeSyncConfig: "/ops/time/config",
});

export const STREAM_API_ROUTES = Object.freeze({
  streams: "/streams",
  iceServers: "/streams/ice-servers",
  mapConfig: "/map/config",
});
