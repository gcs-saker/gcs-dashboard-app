export type DashboardDensityMode = "expanded" | "overview";
export type DashboardPriorityMode = "default" | "map" | "stream";

export const DEFAULT_DASHBOARD_DENSITY_MODE: DashboardDensityMode = "expanded";
export const DEFAULT_DASHBOARD_PRIORITY_MODE: DashboardPriorityMode = "default";

const DENSITY_MODES = new Set<DashboardDensityMode>(["expanded", "overview"]);
const PRIORITY_MODES = new Set<DashboardPriorityMode>(["default", "map", "stream"]);

interface DashboardLayoutPreferenceCandidate {
  dashboardDensityMode?: unknown;
  dashboardLayoutMode?: unknown;
  dashboardPriorityMode?: unknown;
}

export function normalizeDashboardLayoutPreferences(value: DashboardLayoutPreferenceCandidate): {
  dashboardDensityMode: DashboardDensityMode;
  dashboardPriorityMode: DashboardPriorityMode;
} {
  const legacy = normalizeLegacyLayoutMode(value.dashboardLayoutMode);
  return {
    dashboardDensityMode: isDensityMode(value.dashboardDensityMode)
      ? value.dashboardDensityMode : legacy?.density ?? DEFAULT_DASHBOARD_DENSITY_MODE,
    dashboardPriorityMode: isPriorityMode(value.dashboardPriorityMode)
      ? value.dashboardPriorityMode : legacy?.priority ?? DEFAULT_DASHBOARD_PRIORITY_MODE,
  };
}

function isDensityMode(value: unknown): value is DashboardDensityMode {
  return typeof value === "string" && DENSITY_MODES.has(value as DashboardDensityMode);
}

function isPriorityMode(value: unknown): value is DashboardPriorityMode {
  return typeof value === "string" && PRIORITY_MODES.has(value as DashboardPriorityMode);
}

function normalizeLegacyLayoutMode(value: unknown): { density: DashboardDensityMode; priority: DashboardPriorityMode } | null {
  if (value === "overview") return { density: "overview", priority: "default" };
  if (value === "map-priority") return { density: "expanded", priority: "map" };
  if (value === "stream-priority") return { density: "expanded", priority: "stream" };
  if (value === "expanded") return { density: "expanded", priority: "default" };
  return null;
}
