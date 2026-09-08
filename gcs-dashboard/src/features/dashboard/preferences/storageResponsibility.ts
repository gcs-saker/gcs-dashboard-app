export const BROWSER_STORAGE_RESPONSIBILITIES = Object.freeze({
  indexedDb: Object.freeze([
    "dashboard-layout",
    "widget-visibility",
    "stream-device-alias",
    "cctv-grid-preference",
    "motion-mode",
    "map-preference",
    "server-health-history",
    "rtt-snapshot-cache",
  ]),
  memoryOnly: Object.freeze([
    "current-interaction-state",
  ]),
  sessionStorage: Object.freeze([
    "redirect-after-login",
    "one-shot-filter",
    "refresh-scoped-ui-state",
  ]),
  tanStackQuery: Object.freeze([
    "server-state",
    "health-snapshot",
    "stream-registry-response",
    "operational-event-response",
  ]),
  httpOnlyCookie: Object.freeze([
    "refresh-token",
  ]),
  zustand: Object.freeze([
    "memory-only-access-token",
    "memory-only-current-user",
    "refresh-request-coordination",
    "system-status-memory-cache",
    "operational-event-memory-history",
    "selected-stream",
    "selected-tab",
    "event-filter",
    "panel-open-state",
    "map-auto-focus",
  ]),
});

export const FORBIDDEN_BROWSER_STORAGE_KEYS = Object.freeze([
  "password",
  "refreshToken",
  "refresh_token",
  "privateKey",
  "private_key",
  "serverSecret",
  "server_secret",
  "longLivedAccessToken",
  "long_lived_access_token",
]);
