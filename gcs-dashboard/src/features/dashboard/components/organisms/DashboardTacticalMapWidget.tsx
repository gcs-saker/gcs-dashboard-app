import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import { DashboardMapWidget, type TacticalMapComponent } from "@dashboard/components/organisms/DashboardMapWidget";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { MapFocusViewModel } from "@dashboard/mapFocus";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import type { ReactNode } from "react";

interface DashboardTacticalMapWidgetProps {
  mapFocus: MapFocusViewModel;
  motionEnabled: boolean;
  onSelectStream: (streamId: string) => void;
  panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  tacticalMap: TacticalMapComponent;
  widget: DashboardWidgetDefinition;
  widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}

export function DashboardTacticalMapWidget(props: DashboardTacticalMapWidgetProps) {
  return (
    <DashboardErrorBoundary
      boundaryId="panel:tactical-map"
      description="지도 패널만 격리되었습니다. 스트림 수신과 이벤트 로그는 계속 사용할 수 있습니다."
      resetKeys={[props.selectedStream.id]}
      scope="panel"
      title="지도"
    >
      <DashboardMapWidget
        controls={props.widgetControls("tactical-map", "지도")}
        mapFocus={props.mapFocus}
        motionEnabled={props.motionEnabled}
        onSelectStream={props.onSelectStream}
        panelClass={props.panelClass}
        selectedStream={props.selectedStream}
        streams={props.streams}
        tacticalMap={props.tacticalMap}
        widget={props.widget}
      />
    </DashboardErrorBoundary>
  );
}
