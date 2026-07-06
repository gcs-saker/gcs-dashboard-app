import type { DashboardWidgetId } from "@dashboard/dashboardLayout";
import { WidgetHeaderActions } from "@dashboard/components/WidgetHeaderActions";

export interface DashboardWidgetControlsProps {
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  onHideWidget: (widgetId: DashboardWidgetId) => void;
  onPopOutWidget: (widgetId: DashboardWidgetId) => void;
  onToggleWidgetPin: (widgetId: DashboardWidgetId) => void;
  title: string;
  widgetId: DashboardWidgetId;
}

export function DashboardWidgetControls({
  isWidgetPinned,
  onHideWidget,
  onPopOutWidget,
  onToggleWidgetPin,
  title,
  widgetId,
}: DashboardWidgetControlsProps) {
  return (
    <WidgetHeaderActions
      isPinned={isWidgetPinned(widgetId)}
      onHide={onHideWidget}
      onPopOut={onPopOutWidget}
      onTogglePin={onToggleWidgetPin}
      title={title}
      widgetId={widgetId}
    />
  );
}
