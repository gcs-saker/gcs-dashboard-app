import type { DashboardWidgetId } from "@dashboard/layout/dashboardLayout";

interface WidgetHeaderActionsProps {
  widgetId: DashboardWidgetId;
  title: string;
  isPinned: boolean;
  onTogglePin: (widgetId: DashboardWidgetId) => void;
  onPopOut: (widgetId: DashboardWidgetId) => void;
  onHide: (widgetId: DashboardWidgetId) => void;
}

export function WidgetHeaderActions(_: WidgetHeaderActionsProps): null {
  return null;
}
