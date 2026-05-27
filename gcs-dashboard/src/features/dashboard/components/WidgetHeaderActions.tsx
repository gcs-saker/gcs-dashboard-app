import type { DashboardWidgetId } from "../dashboardLayout";

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
  isPinned,
  onTogglePin,
  onPopOut,
  onHide,
}: WidgetHeaderActionsProps) {
  return (
    <span className="widget-actions" aria-label={`${title} 위젯 도구`}>
      <button
        aria-pressed={isPinned}
        className={`widget-icon-button ${isPinned ? "is-active" : ""}`}
        onClick={() => onTogglePin(widgetId)}
        title={`${title} 고정`}
        type="button"
      >
        PIN
      </button>
      <button
        className="widget-icon-button"
        onClick={() => onPopOut(widgetId)}
        title={`${title} 팝아웃`}
        type="button"
      >
        POP
      </button>
      <button
        className="widget-icon-button"
        onClick={() => onHide(widgetId)}
        title={`${title} 숨김`}
        type="button"
      >
        DEL
      </button>
    </span>
  );
}
