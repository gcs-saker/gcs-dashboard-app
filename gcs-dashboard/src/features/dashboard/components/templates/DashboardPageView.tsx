import { useCallback } from "react";
import type { DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { StreamAvailabilityNotification } from "@dashboard/hooks/useStreamAvailabilityNotification";
import type { DashboardUserPreferences } from "@dashboard/userPreferences";
import { DashboardOverlays, type DashboardOverlaysProps } from "@dashboard/components/DashboardOverlays";
import { StreamNotificationToast } from "@dashboard/components/atoms/StreamNotificationToast";
import { DashboardWidgetControls } from "@dashboard/components/molecules/DashboardWidgetControls";
import { DashboardHeader, type DashboardHeaderProps } from "@dashboard/components/navigation/DashboardHeader";
import { DashboardViewRouter, type DashboardViewRouterProps } from "./DashboardViewRouter";

export interface DashboardWidgetControlBindings {
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  onHideWidget: (widgetId: DashboardWidgetId) => void;
  onPopOutWidget: (widgetId: DashboardWidgetId) => void;
  onToggleWidgetPin: (widgetId: DashboardWidgetId) => void;
}

export interface DashboardPageViewProps {
  headerProps: DashboardHeaderProps;
  motionMode: DashboardUserPreferences["motionMode"];
  notification: StreamAvailabilityNotification | null;
  onDismissNotification: () => void;
  overlayProps: Omit<DashboardOverlaysProps, "widgetControls">;
  routerProps: Omit<DashboardViewRouterProps, "widgetControls">;
  widgetControls: DashboardWidgetControlBindings;
}

export function DashboardPageView({
  headerProps,
  motionMode,
  notification,
  onDismissNotification,
  overlayProps,
  routerProps,
  widgetControls: widgetControlBindings,
}: DashboardPageViewProps) {
  const { isWidgetPinned, onHideWidget, onPopOutWidget, onToggleWidgetPin } = widgetControlBindings;
  const widgetControls = useCallback(
    (widgetId: DashboardWidgetId, title: string) => (
      <DashboardWidgetControls
        isWidgetPinned={isWidgetPinned}
        onHideWidget={onHideWidget}
        onPopOutWidget={onPopOutWidget}
        onToggleWidgetPin={onToggleWidgetPin}
        title={title}
        widgetId={widgetId}
      />
    ),
    [isWidgetPinned, onHideWidget, onPopOutWidget, onToggleWidgetPin],
  );

  return (
    <main className="ops-dashboard" data-motion={motionMode} aria-label="Field Ops Dashboard">
      <DashboardHeader {...headerProps} />

      {notification ? <StreamNotificationToast notification={notification} onDismiss={onDismissNotification} /> : null}

      <DashboardViewRouter {...routerProps} widgetControls={widgetControls} />
      <DashboardOverlays {...overlayProps} widgetControls={widgetControls} />
    </main>
  );
}
