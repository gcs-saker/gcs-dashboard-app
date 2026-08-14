import { RenderProfilerBoundary } from "@/features/RenderProfilerBoundary";
import { RENDER_DIAGNOSTIC_LABELS } from "@/features/renderDiagnostics";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";
import { AudioWaveformPanel } from "@dashboard/components/AudioWaveformPanel";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { TalkbackPublisherSnapshot } from "@streaming/talkbackPublisherContracts";

interface DashboardAudioWaveformWidgetProps {
  analysis: AudioAnalysisSnapshot | null;
  isMotionEnabled: boolean;
  selectedStream: DashboardStreamSlot;
  talkback: TalkbackPublisherSnapshot;
}

export function DashboardAudioWaveformWidget(props: DashboardAudioWaveformWidgetProps) {
  return (
    <RenderProfilerBoundary id={RENDER_DIAGNOSTIC_LABELS.audioWaveformPanel}>
      <DashboardErrorBoundary
        boundaryId="panel:audio-waveform"
        resetKeys={[props.selectedStream.id]}
        scope="panel"
        title="음성 파형 분석"
      >
        <AudioWaveformPanel {...props} />
      </DashboardErrorBoundary>
    </RenderProfilerBoundary>
  );
}
