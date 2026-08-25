import { useCallback } from "react";
import type { DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { StreamAvailabilityNotification } from "@dashboard/hooks/shared/useStreamAvailabilityNotification";
import type { DashboardUserPreferences } from "@dashboard/preferences/userPreferences";
import { DashboardOverlays, type DashboardOverlaysProps } from "@dashboard/components/DashboardOverlays";
import { StreamNotificationToast } from "@dashboard/components/atoms/StreamNotificationToast";
import { DashboardWidgetControls } from "@dashboard/components/molecules/DashboardWidgetControls";
import { DashboardHeader, type DashboardHeaderProps } from "@dashboard/components/navigation/DashboardHeader";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import { DashboardViewRouter, type DashboardViewRouterProps } from "./DashboardViewRouter";
import { useWhipAudioPublisher } from "@streaming/hooks/audio/useWhipAudioPublisher";

export interface DashboardWidgetControlBindings {
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  onHideWidget: (widgetId: DashboardWidgetId) => void;
  onPopOutWidget: (widgetId: DashboardWidgetId) => void;
  onToggleWidgetPin: (widgetId: DashboardWidgetId) => void;
}

export interface DashboardPageViewProps {
  headerProps: Omit<DashboardHeaderProps, "talkback">;
  motionMode: DashboardUserPreferences["motionMode"];
  dashboardLayoutMode: DashboardUserPreferences["dashboardLayoutMode"];
  notification: StreamAvailabilityNotification | null;
  onDismissNotification: () => void;
  overlayProps: Omit<DashboardOverlaysProps, "widgetControls">;
  routerProps: Omit<DashboardViewRouterProps, "talkback" | "widgetControls">;
  widgetControls: DashboardWidgetControlBindings;
}

export function DashboardPageView({
  headerProps,
  dashboardLayoutMode,
  motionMode,
  notification,
  onDismissNotification,
  overlayProps,
  routerProps,
  widgetControls: widgetControlBindings,
}: DashboardPageViewProps) {
  const talkback = useWhipAudioPublisher();
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
    <main className="ops-dashboard" data-layout-mode={dashboardLayoutMode} data-motion={motionMode} aria-label="Field Ops Dashboard">
      <DashboardHeader {...headerProps} talkback={talkback} />

      {notification ? <StreamNotificationToast notification={notification} onDismiss={onDismissNotification} /> : null}

      <DashboardErrorBoundary
        boundaryId={`dashboard-route:${routerProps.activeView}`}
        description="현재 화면만 격리되었습니다. 상단 메뉴로 다른 화면을 열거나 다시 시도할 수 있습니다."
        resetKeys={[routerProps.activeView]}
        scope="route"
        title="대시보드 화면"
      >
        <DashboardViewRouter {...routerProps} talkback={talkback} widgetControls={widgetControls} />
      </DashboardErrorBoundary>
      <DashboardOverlays {...overlayProps} widgetControls={widgetControls} />
    </main>
  );
}
