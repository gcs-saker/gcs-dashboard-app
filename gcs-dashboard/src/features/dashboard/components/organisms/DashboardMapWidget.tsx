import { Suspense, type ComponentType, type ReactNode } from "react";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { MapFocusViewModel } from "@dashboard/mapFocus";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";

export type TacticalMapComponent = ComponentType<{
  isMotionEnabled?: boolean;
  onSelectStream?: (streamId: string) => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}>;

interface DashboardMapWidgetProps {
  controls: ReactNode;
  mapFocus: MapFocusViewModel;
  motionEnabled: boolean;
  onSelectStream: (streamId: string) => void;
  panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  tacticalMap: TacticalMapComponent;
  widget: DashboardWidgetDefinition;
}

export function DashboardMapWidget({
  controls,
  mapFocus,
  motionEnabled,
  onSelectStream,
  panelClass,
  selectedStream,
  streams,
  tacticalMap: TacticalMap,
  widget,
}: DashboardMapWidgetProps) {
  return (
    <section
      aria-labelledby="map-title"
      className={panelClass("ops-panel tactical-map", "tactical-map")}
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="map-title">지도</h2>
        <span className="ops-panel__header-actions">
          <span className="ops-badge">500 m</span>
          {controls}
        </span>
      </div>
      <Suspense fallback={<MapLoadingFallback />}>
        <TacticalMap
          isMotionEnabled={motionEnabled}
          onSelectStream={onSelectStream}
          selectedStream={selectedStream}
          streams={streams}
        />
      </Suspense>
      <span className="map-focus__label" data-testid="map-focus-label">{mapFocus.label}</span>
    </section>
  );
}

function MapLoadingFallback() {
  return (
    <div className="tactical-map__canvas tactical-map__canvas--loading" role="status" aria-label="지도 준비 중">
      <span />
    </div>
  );
}
