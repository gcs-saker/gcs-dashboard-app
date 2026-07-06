import type { ReactNode } from "react";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { AudioAnalysisSnapshot, TelemetryRow } from "@dashboard/dashboardPresentation";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { MapFocusViewModel } from "@dashboard/mapFocus";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { AiResultsPanel } from "@dashboard/components/AiResultsPanel";
import { AudioWaveformPanel } from "@dashboard/components/AudioWaveformPanel";
import { OpsSummaryPanel } from "@dashboard/components/OpsSummaryPanel";
import { SelectedStreamPanel } from "@dashboard/components/SelectedStreamPanel";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import { TelemetryPanel } from "@dashboard/components/TelemetryPanel";
import { DashboardMapWidget, type TacticalMapComponent } from "@dashboard/components/organisms/DashboardMapWidget";

interface DashboardMainGridProps {
  aiResultsWidget: DashboardWidgetDefinition;
  audioActiveStreamId: string | null;
  audioAnalysis: AudioAnalysisSnapshot | null;
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  isWidgetVisible: (widgetId: DashboardWidgetId) => boolean;
  mapFocus: MapFocusViewModel;
  motionEnabled: boolean;
  onPlaybackStatusChange: (streamId: string, snapshot: RealtimePlayerSnapshot) => void;
  onSelectMapStream: (streamId: string) => void;
  onSelectStream: (streamId: string) => void;
  onToggleAiMode: (streamId: string) => void;
  onToggleTalkbackTarget: (streamPath: string) => void;
  opsSummaryWidget: DashboardWidgetDefinition;
  panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  selectedStream: DashboardStreamSlot;
  selectedStreamId: string;
  streams: DashboardStreamSlot[];
  tacticalMap: TacticalMapComponent;
  tacticalMapWidget: DashboardWidgetDefinition;
  talkbackTargetStreamIds: string[];
  telemetryRows: TelemetryRow[];
  telemetryWidget: DashboardWidgetDefinition;
  widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}

export function DashboardMainGrid(props: DashboardMainGridProps) {
  const { isWidgetVisible, selectedStream, streams, widgetControls } = props;
  return (
    <section className="ops-dashboard__grid">
      {isWidgetVisible("tactical-map") ? (
        <DashboardMapWidget
          controls={widgetControls("tactical-map", "지도")}
          mapFocus={props.mapFocus}
          motionEnabled={props.motionEnabled}
          onSelectStream={props.onSelectMapStream}
          panelClass={props.panelClass}
          selectedStream={selectedStream}
          streams={streams}
          tacticalMap={props.tacticalMap}
          widget={props.tacticalMapWidget}
        />
      ) : null}
      {isWidgetVisible("selected-stream") ? (
        <SelectedStreamPanel
          controls={widgetControls("selected-stream", "선택 스트림")}
          hasAudioActivity={selectedStream.id === props.audioActiveStreamId}
          isPinned={props.isWidgetPinned("selected-stream")}
          onPlaybackStatusChange={props.onPlaybackStatusChange}
          onToggleAiMode={props.onToggleAiMode}
          stream={selectedStream}
        />
      ) : null}
      {isWidgetVisible("stream-grid") ? (
        <StreamGrid
          audioActiveStreamId={props.audioActiveStreamId}
          onSelectStream={props.onSelectStream}
          onToggleTalkbackTarget={props.onToggleTalkbackTarget}
          selectedStreamId={props.selectedStreamId}
          talkbackTargetStreamIds={props.talkbackTargetStreamIds}
          streams={streams}
        />
      ) : null}
      {isWidgetVisible("ops-summary") ? (
        <OpsSummaryPanel
          audioAnalysis={props.audioAnalysis}
          controls={widgetControls("ops-summary", "운용 요약")}
          selectedStream={selectedStream}
          streamCount={streams.length}
          talkbackTargetCount={props.talkbackTargetStreamIds.length}
          widget={props.opsSummaryWidget}
        />
      ) : null}
      {isWidgetVisible("telemetry-panel") ? (
        <TelemetryPanel
          controls={widgetControls("telemetry-panel", "지오메트리 / 텔레메트리")}
          isPinned={props.isWidgetPinned("telemetry-panel")}
          rows={props.telemetryRows}
          stream={selectedStream}
          widget={props.telemetryWidget}
        />
      ) : null}
      <AudioWaveformPanel analysis={props.audioAnalysis} isMotionEnabled={props.motionEnabled} selectedStream={selectedStream} />
      {isWidgetVisible("ai-results") ? (
        <AiResultsPanel
          controls={widgetControls("ai-results", "AI 결과")}
          panelClassName={props.panelClass("ops-panel ai-panel", "ai-results")}
          widget={props.aiResultsWidget}
        />
      ) : null}
    </section>
  );
}
