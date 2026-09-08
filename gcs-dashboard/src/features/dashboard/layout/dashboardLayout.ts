import { SELECTED_STREAM_WIDGET, STREAM_GRID_WIDGET } from "@dashboard/streaming/streamTypes";

export type DashboardWidgetId =
  | "asset-tree"
  | "tactical-map"
  | "selected-stream"
  | "stream-grid"
  | "telemetry-panel"
  | "ops-summary"
  | "ai-results";

export interface DashboardGridPosition {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  minWidth: number;
  minHeight: number;
  defaultPosition: DashboardGridPosition;
}

export interface DashboardLayoutItem extends DashboardWidgetDefinition {
  pinned: boolean;
  visible: boolean;
}

export const DASHBOARD_WIDGET_REGISTRY: Record<DashboardWidgetId, DashboardWidgetDefinition> = {
  "asset-tree": {
    id: "asset-tree",
    title: "자산트리",
    minWidth: 300,
    minHeight: 280,
    defaultPosition: { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
  },
  "tactical-map": {
    id: "tactical-map",
    title: "지도",
    minWidth: 420,
    minHeight: 340,
    defaultPosition: { column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
  },
  "selected-stream": {
    id: "selected-stream",
    title: SELECTED_STREAM_WIDGET.title,
    minWidth: SELECTED_STREAM_WIDGET.minWidth,
    minHeight: SELECTED_STREAM_WIDGET.minHeight,
    defaultPosition: { column: 3, row: 1, columnSpan: 1, rowSpan: 1 },
  },
  "stream-grid": {
    id: "stream-grid",
    title: STREAM_GRID_WIDGET.title,
    minWidth: STREAM_GRID_WIDGET.minWidth,
    minHeight: STREAM_GRID_WIDGET.minHeight,
    defaultPosition: { column: 3, row: 2, columnSpan: 1, rowSpan: 1 },
  },
  "telemetry-panel": {
    id: "telemetry-panel",
    title: "지오메트리 / 텔레메트리",
    minWidth: 280,
    minHeight: 140,
    defaultPosition: { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
  },
  "ops-summary": {
    id: "ops-summary",
    title: "운용 요약",
    minWidth: 280,
    minHeight: 140,
    defaultPosition: { column: 1, row: 2, columnSpan: 1, rowSpan: 1 },
  },
  "ai-results": {
    id: "ai-results",
    title: "AI 결과",
    minWidth: 360,
    minHeight: 110,
    defaultPosition: { column: 1, row: 3, columnSpan: 3, rowSpan: 1 },
  },
};

const DEFAULT_DASHBOARD_WIDGET_ORDER: DashboardWidgetId[] = [
  "asset-tree",
  "tactical-map",
  "selected-stream",
  "stream-grid",
  "telemetry-panel",
  "ops-summary",
  "ai-results",
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutItem[] = DEFAULT_DASHBOARD_WIDGET_ORDER.map((widgetId) => ({
  ...DASHBOARD_WIDGET_REGISTRY[widgetId],
  pinned: false,
  visible: widgetId !== "ai-results",
}));

export function getDashboardWidgetDefinition(widgetId: DashboardWidgetId): DashboardWidgetDefinition {
  return DASHBOARD_WIDGET_REGISTRY[widgetId];
}

export function resetDashboardLayout(): DashboardLayoutItem[] {
  return DEFAULT_DASHBOARD_LAYOUT.map((item) => ({
    ...item,
    defaultPosition: { ...item.defaultPosition },
  }));
}

export function updateDashboardWidgetPosition(
  layout: DashboardLayoutItem[],
  widgetId: DashboardWidgetId,
  position: DashboardGridPosition,
): DashboardLayoutItem[] {
  return layout.map((item) =>
    item.id === widgetId
      ? {
          ...item,
          defaultPosition: {
            column: Math.max(1, position.column),
            row: Math.max(1, position.row),
            columnSpan: Math.max(1, position.columnSpan),
            rowSpan: Math.max(1, position.rowSpan),
          },
        }
      : item,
  );
}

export function setDashboardWidgetPinned(
  layout: DashboardLayoutItem[],
  widgetId: DashboardWidgetId,
  pinned: boolean,
): DashboardLayoutItem[] {
  return layout.map((item) => (item.id === widgetId ? { ...item, pinned } : item));
}

export function setDashboardWidgetVisible(
  layout: DashboardLayoutItem[],
  widgetId: DashboardWidgetId,
  visible: boolean,
): DashboardLayoutItem[] {
  return layout.map((item) => (item.id === widgetId ? { ...item, visible } : item));
}

export function getVisibleDashboardLayout(layout: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return layout.filter((item) => item.visible);
}
