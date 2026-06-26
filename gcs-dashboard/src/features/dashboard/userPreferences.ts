import type { CctvQualityMode } from "./components/CctvChannelCard";
import { resetDashboardLayout, type DashboardLayoutItem } from "./dashboardLayout";
import { detectPreferredMotionMode, normalizeMotionMode, type MotionMode } from "./motionPreference";
import { EMPTY_STREAM_PREFERENCES, type StreamPreferencesSnapshot } from "./streamPreferences";

export type DashboardView = "dashboard" | "cctv" | "events" | "status" | "settings";
export type CctvLayoutMode = "3x3" | "4x4" | "5x5" | "auto";

export interface DashboardUserPreferences {
  readonly activeView: DashboardView;
  readonly cctvLayoutMode: CctvLayoutMode;
  readonly cctvQualityMode: CctvQualityMode;
  readonly layout: DashboardLayoutItem[];
  readonly motionMode: MotionMode;
  readonly streamPreferences: StreamPreferencesSnapshot;
  readonly version: number;
}

export const DASHBOARD_USER_PREFERENCES_VERSION = 1;
export const DEFAULT_DASHBOARD_VIEW: DashboardView = "dashboard";
export const DEFAULT_CCTV_LAYOUT_MODE: CctvLayoutMode = "4x4";
export const DEFAULT_CCTV_QUALITY_MODE: CctvQualityMode = "preview";
const DASHBOARD_VIEWS = new Set<DashboardView>(["dashboard", "cctv", "events", "status", "settings"]);
const CCTV_LAYOUT_MODES = new Set<CctvLayoutMode>(["3x3", "4x4", "5x5", "auto"]);
const CCTV_QUALITY_MODES = new Set<CctvQualityMode>(["preview", "high"]);
const ANONYMOUS_PREFERENCE_SCOPE = "preview";
const USER_KEY_SAFE_PATTERN = /[^a-zA-Z0-9._-]/g;

export function createDefaultDashboardUserPreferences(): DashboardUserPreferences {
  return {
    activeView: DEFAULT_DASHBOARD_VIEW,
    cctvLayoutMode: DEFAULT_CCTV_LAYOUT_MODE,
    cctvQualityMode: DEFAULT_CCTV_QUALITY_MODE,
    layout: resetDashboardLayout(),
    motionMode: detectPreferredMotionMode(),
    streamPreferences: EMPTY_STREAM_PREFERENCES,
    version: DASHBOARD_USER_PREFERENCES_VERSION,
  };
}

export function createDashboardUserPreferenceKey(username: string | null | undefined): string {
  const rawScope = username?.trim() || ANONYMOUS_PREFERENCE_SCOPE;
  return `dashboard:${rawScope.replace(USER_KEY_SAFE_PATTERN, "_")}`;
}

export function normalizeDashboardUserPreferences(value: unknown): DashboardUserPreferences {
  const defaults = createDefaultDashboardUserPreferences();
  if (!value || typeof value !== "object") return defaults;
  const candidate = value as Partial<DashboardUserPreferences>;

  return {
    activeView: isDashboardView(candidate.activeView) ? candidate.activeView : defaults.activeView,
    cctvLayoutMode: isCctvLayoutMode(candidate.cctvLayoutMode) ? candidate.cctvLayoutMode : defaults.cctvLayoutMode,
    cctvQualityMode: isCctvQualityMode(candidate.cctvQualityMode) ? candidate.cctvQualityMode : defaults.cctvQualityMode,
    layout: normalizeLayout(candidate.layout, defaults.layout),
    motionMode: normalizeMotionMode(candidate.motionMode, defaults.motionMode),
    streamPreferences: normalizeStreamPreferences(candidate.streamPreferences),
    version: DASHBOARD_USER_PREFERENCES_VERSION,
  };
}

function isDashboardView(value: unknown): value is DashboardView {
  return typeof value === "string" && DASHBOARD_VIEWS.has(value as DashboardView);
}

function isCctvLayoutMode(value: unknown): value is CctvLayoutMode {
  return typeof value === "string" && CCTV_LAYOUT_MODES.has(value as CctvLayoutMode);
}

function isCctvQualityMode(value: unknown): value is CctvQualityMode {
  return typeof value === "string" && CCTV_QUALITY_MODES.has(value as CctvQualityMode);
}

function normalizeLayout(
  value: DashboardUserPreferences["layout"] | undefined,
  fallback: DashboardLayoutItem[],
): DashboardLayoutItem[] {
  if (!Array.isArray(value)) return fallback;
  const fallbackById = new Map(fallback.map((item) => [item.id, item]));
  const normalized = value.flatMap((item) => {
    const base = fallbackById.get(item.id);
    if (!base) return [];
    return [{
      ...base,
      defaultPosition: {
        column: positiveInteger(item.defaultPosition?.column, base.defaultPosition.column),
        columnSpan: positiveInteger(item.defaultPosition?.columnSpan, base.defaultPosition.columnSpan),
        row: positiveInteger(item.defaultPosition?.row, base.defaultPosition.row),
        rowSpan: positiveInteger(item.defaultPosition?.rowSpan, base.defaultPosition.rowSpan),
      },
      pinned: Boolean(item.pinned),
      visible: Boolean(item.visible),
    }];
  });
  const seen = new Set(normalized.map((item) => item.id));
  return [...normalized, ...fallback.filter((item) => !seen.has(item.id))];
}

function normalizeStreamPreferences(value: unknown): StreamPreferencesSnapshot {
  if (!value || typeof value !== "object") return EMPTY_STREAM_PREFERENCES;
  const aliases = (value as Partial<StreamPreferencesSnapshot>).deviceAliases;
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) return EMPTY_STREAM_PREFERENCES;
  const deviceAliases = Object.fromEntries(
    Object.entries(aliases).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return { deviceAliases };
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
