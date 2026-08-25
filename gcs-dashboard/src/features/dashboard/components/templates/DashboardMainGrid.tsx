import type { ReactNode } from "react";
import { RENDER_DIAGNOSTIC_LABELS } from "@/features/renderDiagnostics";
import { RenderProfilerBoundary } from "@/features/RenderProfilerBoundary";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import { AiResultsPanel } from "@dashboard/components/AiResultsPanel";
import { OpsSummaryPanel } from "@dashboard/components/OpsSummaryPanel";
import { SelectedStreamPanel } from "@dashboard/components/SelectedStreamPanel";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import { TelemetryPanel } from "@dashboard/components/TelemetryPanel";
import { DashboardAudioWaveformWidget } from "@dashboard/components/organisms/DashboardAudioWaveformWidget";
import { DashboardTacticalMapWidget } from "@dashboard/components/organisms/DashboardTacticalMapWidget";
import type { TacticalMapComponent } from "@dashboard/components/organisms/DashboardMapWidget";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { AudioAnalysisSnapshot, TelemetryRow } from "@dashboard/layout/dashboardPresentation";
import type { MapFocusViewModel } from "@dashboard/layout/mapFocus";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";
import type { DashboardLayoutMode } from "@dashboard/preferences/userPreferences";

interface DashboardMainGridProps {
  aiResultsWidget: DashboardWidgetDefinition; audioActiveStreamId: string | null;
  dashboardLayoutMode: DashboardLayoutMode;
  audioAnalysis: AudioAnalysisSnapshot | null; isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  isWidgetVisible: (widgetId: DashboardWidgetId) => boolean; mapFocus: MapFocusViewModel; motionEnabled: boolean;
  onPlaybackStatusChange: (streamId: string, snapshot: RealtimePlayerSnapshot) => void;
  onSelectMapStream: (streamId: string) => void; onSelectStream: (streamId: string) => void;
  onToggleAiMode: (streamId: string) => void; onToggleTalkbackTarget: (streamPath: string) => void;
  opsSummaryWidget: DashboardWidgetDefinition; panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  selectedStream: DashboardStreamSlot; selectedStreamId: string; streams: DashboardStreamSlot[];
  tacticalMap: TacticalMapComponent; tacticalMapWidget: DashboardWidgetDefinition;
  talkbackTargetStreamIds: string[]; talkback: TalkbackPublisherSnapshot; telemetryRows: TelemetryRow[];
  telemetryWidget: DashboardWidgetDefinition; widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}

export function DashboardMainGrid(props: DashboardMainGridProps) {
  return <section className="ops-dashboard__grid">
    <MapPanel {...props} /><SelectedPanel {...props} /><StreamGridPanel {...props} />
    <SummaryPanel {...props} /><TelemetryWidget {...props} />
    {props.dashboardLayoutMode !== "overview" ? <DashboardAudioWaveformWidget analysis={props.audioAnalysis}
      isMotionEnabled={props.motionEnabled} selectedStream={props.selectedStream} talkback={props.talkback} /> : null}
    <AiPanel {...props} />
  </section>;
}

function MapPanel(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("tactical-map")) return null;
  return <DashboardTacticalMapWidget mapFocus={props.mapFocus} motionEnabled={props.motionEnabled}
    onSelectStream={props.onSelectMapStream} panelClass={props.panelClass} selectedStream={props.selectedStream}
    streams={props.streams} tacticalMap={props.tacticalMap} widget={props.tacticalMapWidget}
    widgetControls={props.widgetControls} />;
}

function SelectedPanel(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("selected-stream")) return null;
  return <DashboardErrorBoundary boundaryId="panel:selected-stream"
    description="선택 스트림 패널만 격리되었습니다. 스트림 목록에서 다른 장비를 선택해 복구를 시도할 수 있습니다."
    resetKeys={[props.selectedStream.id, props.selectedStream.streamPath]} scope="panel" title="선택 스트림">
    <SelectedStreamPanel controls={props.widgetControls("selected-stream", "선택 스트림")}
      hasAudioActivity={props.selectedStream.id === props.audioActiveStreamId}
      isPinned={props.isWidgetPinned("selected-stream")} onPlaybackStatusChange={props.onPlaybackStatusChange}
      onToggleAiMode={props.onToggleAiMode} stream={props.selectedStream} />
  </DashboardErrorBoundary>;
}

function StreamGridPanel(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("stream-grid")) return null;
  return <RenderProfilerBoundary id={RENDER_DIAGNOSTIC_LABELS.streamGrid}>
    <DashboardErrorBoundary boundaryId="panel:stream-grid"
      description="다중 스트림 영역만 격리되었습니다. 선택 스트림과 지도 패널은 계속 유지됩니다."
      resetKeys={[props.selectedStreamId, props.streams.length]} scope="panel" title="다중 스트림">
      <StreamGrid audioActiveStreamId={props.audioActiveStreamId} onSelectStream={props.onSelectStream}
        onToggleTalkbackTarget={props.onToggleTalkbackTarget} selectedStreamId={props.selectedStreamId}
        talkbackTargetStreamIds={props.talkbackTargetStreamIds}
        streams={props.dashboardLayoutMode === "overview" ? props.streams.slice(0, 2) : props.streams} />
    </DashboardErrorBoundary>
  </RenderProfilerBoundary>;
}

function SummaryPanel(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("ops-summary")) return null;
  return <DashboardErrorBoundary boundaryId="panel:ops-summary" scope="panel" title="운용 요약">
    <OpsSummaryPanel audioAnalysis={props.audioAnalysis} controls={props.widgetControls("ops-summary", "운용 요약")}
      selectedStream={props.selectedStream} streamCount={props.streams.length}
      talkbackTargetCount={props.talkbackTargetStreamIds.length} widget={props.opsSummaryWidget} />
  </DashboardErrorBoundary>;
}

function TelemetryWidget(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("telemetry-panel")) return null;
  return <DashboardErrorBoundary boundaryId="panel:telemetry" resetKeys={[props.selectedStream.id]}
    scope="panel" title="지오메트리 / 텔레메트리">
    <TelemetryPanel controls={props.widgetControls("telemetry-panel", "지오메트리 / 텔레메트리")}
      isPinned={props.isWidgetPinned("telemetry-panel")} rows={props.telemetryRows}
      stream={props.selectedStream} widget={props.telemetryWidget} />
  </DashboardErrorBoundary>;
}

function AiPanel(props: DashboardMainGridProps) {
  if (!props.isWidgetVisible("ai-results")) return null;
  return <DashboardErrorBoundary boundaryId="panel:ai-results" scope="panel" title="AI 결과">
    <AiResultsPanel controls={props.widgetControls("ai-results", "AI 결과")}
      panelClassName={props.panelClass("ops-panel ai-panel", "ai-results")} widget={props.aiResultsWidget} />
  </DashboardErrorBoundary>;
}
