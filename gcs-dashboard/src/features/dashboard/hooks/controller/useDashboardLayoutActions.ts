import { useCallback, useMemo } from "react";
import {
  resetDashboardLayout,
  setDashboardWidgetPinned,
  setDashboardWidgetVisible,
  type DashboardWidgetId,
} from "@dashboard/layout/dashboardLayout";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type LayoutActionInput = Pick<DashboardPageActionInput,
  | "isWidgetPinned" | "resetWidgetLayout" | "setLayout" | "setPopoutWidgetId"
>;

export function useDashboardLayoutActions(input: LayoutActionInput) {
  const { isWidgetPinned, resetWidgetLayout, setLayout, setPopoutWidgetId } = input;
  const toggleWidgetPin = useCallback((widgetId: DashboardWidgetId): void => {
    const nextPinned = !isWidgetPinned(widgetId);
    setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
  }, [isWidgetPinned, setLayout]);

  const setWidgetVisible = useCallback((widgetId: DashboardWidgetId, visible: boolean): void => {
    setLayout((current) => setDashboardWidgetVisible(current, widgetId, visible));
  }, [setLayout]);

  const resetLayout = useCallback((): void => {
    resetWidgetLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
  }, [resetWidgetLayout, setPopoutWidgetId]);

  return useMemo(() => ({ resetLayout, setWidgetVisible, toggleWidgetPin }), [resetLayout, setWidgetVisible, toggleWidgetPin]);
}
