import type { DashboardWidgetId } from "@dashboard/layout/dashboardLayout";

interface WidgetHeaderActionsProps {
  widgetId: DashboardWidgetId;
  title: string;
  isPinned: boolean;
  onTogglePin: (widgetId: DashboardWidgetId) => void;
  onPopOut: (widgetId: DashboardWidgetId) => void;
  onHide: (widgetId: DashboardWidgetId) => void;
}

export function WidgetHeaderActions({
  widgetId,
  title,
  onHide,
}: WidgetHeaderActionsProps) {
  return (
    <span className="widget-actions" aria-label={`${title} 위젯 도구`}>
      <button
        className="widget-icon-button is-danger"
        onClick={() => onHide(widgetId)}
        title={`${title} 숨김`}
        type="button"
      >
        닫기
      </button>
    </span>
  );
}
