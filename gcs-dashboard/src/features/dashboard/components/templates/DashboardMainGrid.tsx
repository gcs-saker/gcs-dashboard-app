import type { ReactNode } from "react";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { AudioAnalysisSnapshot, TelemetryRow } from "@dashboard/layout/dashboardPresentation";
import type { DashboardWidgetDefinition, DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { MapFocusViewModel } from "@dashboard/layout/mapFocus";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { AiResultsPanel } from "@dashboard/components/AiResultsPanel";
import { OpsSummaryPanel } from "@dashboard/components/OpsSummaryPanel";
import { SelectedStreamPanel } from "@dashboard/components/SelectedStreamPanel";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import { TelemetryPanel } from "@dashboard/components/TelemetryPanel";
import type { TacticalMapComponent } from "@dashboard/components/organisms/DashboardMapWidget";
import { DashboardAudioWaveformWidget } from "@dashboard/components/organisms/DashboardAudioWaveformWidget";
import { DashboardTacticalMapWidget } from "@dashboard/components/organisms/DashboardTacticalMapWidget";
import { RenderProfilerBoundary } from "@/features/RenderProfilerBoundary";
import { RENDER_DIAGNOSTIC_LABELS } from "@/features/renderDiagnostics";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";
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
  talkback: TalkbackPublisherSnapshot;
  telemetryRows: TelemetryRow[];
  telemetryWidget: DashboardWidgetDefinition;
  widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}
export function DashboardMainGrid(props: DashboardMainGridProps) {
  const { isWidgetVisible, selectedStream, streams, widgetControls } = props;
  return (
    <section className="ops-dashboard__grid">
      {isWidgetVisible("tactical-map") ? (
        <DashboardTacticalMapWidget
          mapFocus={props.mapFocus}
          motionEnabled={props.motionEnabled}
          onSelectStream={props.onSelectMapStream}
          panelClass={props.panelClass}
          selectedStream={selectedStream}
          streams={streams}
          tacticalMap={props.tacticalMap}
          widget={props.tacticalMapWidget}
          widgetControls={widgetControls}
        />
      ) : null}
      {isWidgetVisible("selected-stream") ? (
        <DashboardErrorBoundary
          boundaryId="panel:selected-stream"
          description="선택 스트림 패널만 격리되었습니다. 스트림 목록에서 다른 장비를 선택해 복구를 시도할 수 있습니다."
          resetKeys={[selectedStream.id, selectedStream.streamPath]}
          scope="panel"
          title="선택 스트림"
        >
          <SelectedStreamPanel
            controls={widgetControls("selected-stream", "선택 스트림")}
            hasAudioActivity={selectedStream.id === props.audioActiveStreamId}
            isPinned={props.isWidgetPinned("selected-stream")}
            onPlaybackStatusChange={props.onPlaybackStatusChange}
            onToggleAiMode={props.onToggleAiMode}
            stream={selectedStream}
          />
        </DashboardErrorBoundary>
      ) : null}
      {isWidgetVisible("stream-grid") ? (
        <RenderProfilerBoundary id={RENDER_DIAGNOSTIC_LABELS.streamGrid}>
          <DashboardErrorBoundary
            boundaryId="panel:stream-grid"
            description="다중 스트림 영역만 격리되었습니다. 선택 스트림과 지도 패널은 계속 유지됩니다."
            resetKeys={[props.selectedStreamId, streams.length]}
            scope="panel"
            title="다중 스트림"
          >
            <StreamGrid
              audioActiveStreamId={props.audioActiveStreamId}
              onSelectStream={props.onSelectStream}
              onToggleTalkbackTarget={props.onToggleTalkbackTarget}
              selectedStreamId={props.selectedStreamId}
              talkbackTargetStreamIds={props.talkbackTargetStreamIds}
              streams={streams}
            />
          </DashboardErrorBoundary>
        </RenderProfilerBoundary>
      ) : null}
      {isWidgetVisible("ops-summary") ? (
        <DashboardErrorBoundary boundaryId="panel:ops-summary" scope="panel" title="운용 요약">
          <OpsSummaryPanel
            audioAnalysis={props.audioAnalysis}
            controls={widgetControls("ops-summary", "운용 요약")}
            selectedStream={selectedStream}
            streamCount={streams.length}
            talkbackTargetCount={props.talkbackTargetStreamIds.length}
            widget={props.opsSummaryWidget}
          />
        </DashboardErrorBoundary>
      ) : null}
      {isWidgetVisible("telemetry-panel") ? (
        <DashboardErrorBoundary
          boundaryId="panel:telemetry"
          resetKeys={[selectedStream.id]}
          scope="panel"
          title="지오메트리 / 텔레메트리"
        >
          <TelemetryPanel
            controls={widgetControls("telemetry-panel", "지오메트리 / 텔레메트리")}
            isPinned={props.isWidgetPinned("telemetry-panel")}
            rows={props.telemetryRows}
            stream={selectedStream}
            widget={props.telemetryWidget}
          />
        </DashboardErrorBoundary>
      ) : null}
      <DashboardAudioWaveformWidget
        analysis={props.audioAnalysis}
        isMotionEnabled={props.motionEnabled}
        selectedStream={selectedStream}
        talkback={props.talkback}
      />
      {isWidgetVisible("ai-results") ? (
        <DashboardErrorBoundary boundaryId="panel:ai-results" scope="panel" title="AI 결과">
          <AiResultsPanel
            controls={widgetControls("ai-results", "AI 결과")}
            panelClassName={props.panelClass("ops-panel ai-panel", "ai-results")}
            widget={props.aiResultsWidget}
          />
        </DashboardErrorBoundary>
      ) : null}
    </section>
  );
}
