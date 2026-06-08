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
  mediaControlHealthz: "/media-control/healthz",
  mediaControlReadyz: "/media-control/readyz",
  streamStatus: "/stream/status",
});

export const DASHBOARD_API_ROUTES = Object.freeze({
  assetByGatewayPrefix: "/asset/",
  operationalEvents: "/ops/events",
  telemetryAll: "/telemetry/all",
  telemetryIngest: "/telemetry/",
  timeSyncStatus: "/ops/time/status",
  timeSyncCheck: "/ops/time/check",
  timeSyncConfig: "/ops/time/config",
});

export const STREAM_API_ROUTES = Object.freeze({
  streams: "/streams",
  iceServers: "/streams/ice-servers",
  mapConfig: "/map/config",
});
