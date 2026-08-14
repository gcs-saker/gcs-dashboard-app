import { useCallback, useMemo } from "react";
import {
  resetDashboardLayout,
  setDashboardWidgetPinned,
  setDashboardWidgetVisible,
  type DashboardWidgetId,
} from "@dashboard/layout/dashboardLayout";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type LayoutActionInput = Pick<DashboardPageActionInput,
  | "isWidgetPinned" | "resetWidgetLayout" | "setLayout" | "setLayoutMessage" | "setPopoutWidgetId"
>;

export function useDashboardLayoutActions(input: LayoutActionInput) {
  const { isWidgetPinned, resetWidgetLayout, setLayout, setLayoutMessage, setPopoutWidgetId } = input;
  const toggleWidgetPin = useCallback((widgetId: DashboardWidgetId): void => {
    const nextPinned = !isWidgetPinned(widgetId);
    setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
    setLayoutMessage(nextPinned ? "위젯 고정됨" : "위젯 고정 해제됨");
  }, [isWidgetPinned, setLayout, setLayoutMessage]);

  const setWidgetVisible = useCallback((widgetId: DashboardWidgetId, visible: boolean): void => {
    setLayout((current) => setDashboardWidgetVisible(current, widgetId, visible));
    setLayoutMessage(visible ? "위젯 표시됨" : "위젯 숨김");
  }, [setLayout, setLayoutMessage]);

  const resetLayout = useCallback((): void => {
    resetWidgetLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
    setLayoutMessage("기본 레이아웃으로 초기화됨");
  }, [resetWidgetLayout, setLayoutMessage, setPopoutWidgetId]);

  return useMemo(() => ({ resetLayout, setWidgetVisible, toggleWidgetPin }), [resetLayout, setWidgetVisible, toggleWidgetPin]);
}
