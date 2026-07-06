import { Suspense, type ReactNode } from "react";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { CctvStatusSummary } from "@dashboard/dashboardCctv";
import type { AudioAnalysisSnapshot, TelemetryRow } from "@dashboard/dashboardPresentation";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { MapFocusViewModel } from "@dashboard/mapFocus";
import type { CctvQualityMode } from "@dashboard/components/CctvChannelCard";
import type { CctvLayoutMode, DashboardUserPreferences, DashboardView } from "@dashboard/userPreferences";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { CctvView } from "@dashboard/components/cctv/CctvView";
import { SystemStatusPanel } from "@dashboard/components/SystemStatusPanel";
import { DashboardMainGrid } from "./DashboardMainGrid";
import { EventLogView, TacticalLeafletMap, TimeSyncSettingsView } from "@dashboard/dashboardLazyViews";

export interface DashboardViewRouterProps {
  activeView: DashboardView;
  aiResultsWidget: DashboardWidgetDefinition;
  audioActiveStreamId: string | null;
  audioAnalysis: AudioAnalysisSnapshot | null;
  cctvGridSize: number;
  cctvLayoutMode: CctvLayoutMode;
  cctvQualityMode: CctvQualityMode;
  cctvStatusSummary: CctvStatusSummary;
  cctvStreams: DashboardStreamSlot[];
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  isWidgetVisible: (widgetId: DashboardWidgetId) => boolean;
  mapFocus: MapFocusViewModel;
  motionEnabled: boolean;
  motionMode: DashboardUserPreferences["motionMode"];
  onAuthFailure: () => void;
  onMotionModeChange: (mode: DashboardUserPreferences["motionMode"]) => void;
  onPlaybackStatusChange: (streamId: string, snapshot: RealtimePlayerSnapshot) => void;
  onSelectMapStream: (streamId: string) => void;
  onSelectStream: (streamId: string) => void;
  onSetCctvLayoutMode: (mode: CctvLayoutMode) => void;
  onSetCctvQualityMode: (mode: CctvQualityMode) => void;
  onToggleAiMode: (streamId: string) => void;
  onToggleTalkbackTarget: (streamPath: string) => void;
  opsSummaryWidget: DashboardWidgetDefinition;
  panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  selectedStream: DashboardStreamSlot;
  selectedStreamId: string;
  streams: DashboardStreamSlot[];
  tacticalMapWidget: DashboardWidgetDefinition;
  talkbackTargetStreamIds: string[];
  telemetryRows: TelemetryRow[];
  telemetryWidget: DashboardWidgetDefinition;
  widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}

export function DashboardViewRouter(props: DashboardViewRouterProps) {
  if (props.activeView === "events") {
    return <Suspense fallback={<section className="event-log-view" role="status">이벤트로그 준비 중</section>}><EventLogView /></Suspense>;
  }
  if (props.activeView === "settings") {
    return (
      <Suspense fallback={<section className="time-sync-view" role="status">운영설정 준비 중</section>}>
        <TimeSyncSettingsView motionMode={props.motionMode} onMotionModeChange={props.onMotionModeChange} />
      </Suspense>
    );
  }
  if (props.activeView === "status") {
    return <section className="server-status-view" aria-label="서버 상태"><SystemStatusPanel onAuthFailure={props.onAuthFailure} variant="page" /></section>;
  }
  if (props.activeView === "cctv") {
    return (
      <CctvView
        audioActiveStreamId={props.audioActiveStreamId}
        cctvGridSize={props.cctvGridSize}
        cctvLayoutMode={props.cctvLayoutMode}
        cctvQualityMode={props.cctvQualityMode}
        cctvStatusSummary={props.cctvStatusSummary}
        cctvStreams={props.cctvStreams}
        onSelectStream={props.onSelectStream}
        onSetLayoutMode={props.onSetCctvLayoutMode}
        onSetQualityMode={props.onSetCctvQualityMode}
        onToggleTalkbackTarget={props.onToggleTalkbackTarget}
        selectedStreamId={props.selectedStreamId}
        talkbackTargetStreamIds={props.talkbackTargetStreamIds}
      />
    );
  }
  return (
    <DashboardMainGrid
      {...props}
      onSelectMapStream={props.onSelectMapStream}
      onSelectStream={props.onSelectStream}
      tacticalMap={TacticalLeafletMap}
    />
  );
}
