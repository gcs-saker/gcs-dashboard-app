import { useCallback } from "react";
import type { DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { StreamAvailabilityNotification } from "@dashboard/hooks/useStreamAvailabilityNotification";
import type { DashboardUserPreferences } from "@dashboard/userPreferences";
import type { DashboardRouteMode } from "@dashboard/dashboardRouteMode";
import { DashboardOverlays, type DashboardOverlaysProps } from "@dashboard/components/DashboardOverlays";
import { StreamNotificationToast } from "@dashboard/components/atoms/StreamNotificationToast";
import { DashboardWidgetControls } from "@dashboard/components/molecules/DashboardWidgetControls";
import { DashboardHeader, type DashboardHeaderProps } from "@dashboard/components/navigation/DashboardHeader";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import { DashboardViewRouter, type DashboardViewRouterProps } from "./DashboardViewRouter";
import { StreamReceiverView } from "./StreamReceiverView";
import { useWhipAudioPublisher } from "@streaming/hooks/useWhipAudioPublisher";

export interface DashboardWidgetControlBindings {
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  onHideWidget: (widgetId: DashboardWidgetId) => void;
  onPopOutWidget: (widgetId: DashboardWidgetId) => void;
  onToggleWidgetPin: (widgetId: DashboardWidgetId) => void;
}

export interface DashboardPageViewProps {
  headerProps: Omit<DashboardHeaderProps, "talkback">;
  motionMode: DashboardUserPreferences["motionMode"];
  notification: StreamAvailabilityNotification | null;
  onDismissNotification: () => void;
  onOpenNotification: (streamId: string) => void;
  routeMode: DashboardRouteMode;
  overlayProps: Omit<DashboardOverlaysProps, "widgetControls">;
  routerProps: Omit<DashboardViewRouterProps, "talkback" | "widgetControls">;
  widgetControls: DashboardWidgetControlBindings;
}

export function DashboardPageView({
  headerProps,
  motionMode,
  notification,
  onDismissNotification,
  onOpenNotification,
  routeMode,
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
    <main className="ops-dashboard" data-motion={motionMode} data-route-mode={routeMode} aria-label="Field Ops Dashboard">
      {routeMode === "receiver" ? (
        <StreamReceiverView
          currentUsername={headerProps.currentUser?.username ?? "수신 사용자"}
          onLogout={headerProps.onLogout}
          receiver={{ ...routerProps, talkback, widgetControls }}
        />
      ) : <DashboardHeader {...headerProps} talkback={talkback} />}

      {routeMode !== "receiver" && notification ? (
        <StreamNotificationToast
          notification={notification}
          onDismiss={onDismissNotification}
          onOpen={onOpenNotification}
        />
      ) : null}

      {routeMode !== "receiver" ? <DashboardErrorBoundary
        boundaryId={`dashboard-route:${routerProps.activeView}`}
        description="현재 화면만 격리되었습니다. 상단 메뉴로 다른 화면을 열거나 다시 시도할 수 있습니다."
        resetKeys={[routerProps.activeView]}
        scope="route"
        title="대시보드 화면"
      >
        <DashboardViewRouter {...routerProps} talkback={talkback} widgetControls={widgetControls} />
      </DashboardErrorBoundary> : null}
      {routeMode !== "receiver" ? <DashboardOverlays {...overlayProps} widgetControls={widgetControls} /> : null}
    </main>
  );
}
