export const FRONTEND_STATE_BOUNDARY = Object.freeze({
  server: "server-state",
  ui: "ui-state",
  interaction: "interaction-state",
  persistence: "local-persistence",
} as const);

export type FrontendStateBoundary =
  (typeof FRONTEND_STATE_BOUNDARY)[keyof typeof FRONTEND_STATE_BOUNDARY];

export const FRONTEND_STATE_TOOLS = Object.freeze({
  [FRONTEND_STATE_BOUNDARY.server]: "TanStack Query 또는 API polling hook",
  [FRONTEND_STATE_BOUNDARY.ui]: "Zustand 후보 또는 page-level reducer",
  [FRONTEND_STATE_BOUNDARY.interaction]: "React local state / ref",
  [FRONTEND_STATE_BOUNDARY.persistence]: "IndexedDB-backed preference repository",
} as const);

export const FRONTEND_QUERY_KEY_GROUPS = Object.freeze({
  auth: ["auth"],
  dashboard: ["dashboard"],
  operations: ["ops"],
  streaming: ["streaming"],
} as const);
