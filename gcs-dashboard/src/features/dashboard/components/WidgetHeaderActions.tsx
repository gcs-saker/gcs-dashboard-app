import type { DashboardWidgetId } from "../dashboardLayout";

interface WidgetHeaderActionsProps {
  widgetId: DashboardWidgetId;
  title: string;
  isPinned: boolean;
  onTogglePin: (widgetId: DashboardWidgetId) => void;
  onPopOut: (widgetId: DashboardWidgetId) => void;
}

export function WidgetHeaderActions({
  widgetId,
  title,
  isPinned,
  onTogglePin,
  onPopOut,
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
    </span>
  );
}
