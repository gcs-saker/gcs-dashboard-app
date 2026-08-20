import type { ReactNode } from "react";
import type { DashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import { buildOpsSummaryViewModel } from "@dashboard/operations/opsSummaryViewModel";

interface OpsSummaryPanelProps {
  audioAnalysis: AudioAnalysisSnapshot | null;
  controls: ReactNode;
  selectedStream: DashboardStreamSlot;
  streamCount: number;
  talkbackTargetCount: number;
  widget: DashboardWidgetDefinition;
}

export function OpsSummaryPanel({
  audioAnalysis,
  controls,
  selectedStream,
  streamCount,
  talkbackTargetCount,
  widget,
}: OpsSummaryPanelProps) {
  const viewModel = buildOpsSummaryViewModel(selectedStream, audioAnalysis, streamCount, talkbackTargetCount);

  return (
    <section
      aria-labelledby="ops-summary-title"
      className="ops-panel ops-summary"
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="ops-summary-title">운용 요약</h2>
        {controls}
      </div>
      <OpsSummaryBody selectedStream={selectedStream} viewModel={viewModel} />
    </section>
  );
}

function OpsSummaryBody({
  selectedStream,
  viewModel,
}: {
  selectedStream: DashboardStreamSlot;
  viewModel: ReturnType<typeof buildOpsSummaryViewModel>;
}) {
  return (
    <div className="ops-summary__body">
        <div className={`ops-summary__mission is-${viewModel.missionTone}`}>
          <span>현재 운용 상태</span>
          <strong>{viewModel.missionText}</strong>
          <em>{viewModel.selectedStatusText}</em>
        </div>
        <div className="ops-summary__selected">
          <span>선택 스트림</span>
          <strong>{viewModel.streamDisplayName}</strong>
          <em className={`ops-summary__state is-${selectedStream.status}`}>{viewModel.selectedStatusText}</em>
        </div>
        <div className="ops-summary__focus">
          <strong>{viewModel.focusTitle}</strong>
          <span>{viewModel.focusDetail}</span>
        </div>
        <dl className="ops-summary__telemetry" aria-label="선택 스트림 텔레메트리">
          {viewModel.telemetryTiles.map((tile) => (
            <div className={`is-${tile.tone}`} key={tile.label}>
              <dt>{tile.label}</dt>
              <dd>{tile.value}</dd>
            </div>
          ))}
        </dl>
        <dl className="ops-summary__tiles">
          {viewModel.statusTiles.map((tile) => (
            <div className={`is-${tile.tone}`} key={tile.label}>
              <dt>{tile.label}</dt>
              <dd>{tile.value}</dd>
            </div>
          ))}
        </dl>
        <div className="ops-summary__notes" aria-label="주의 / 상태">
          <span>주의 / 상태</span>
          <ul>
            {viewModel.statusNotes.map((note) => (
              <li className={`is-${note.tone}`} key={note.label}>{note.label}</li>
            ))}
          </ul>
        </div>
        <div className="ops-summary__events" aria-label="최근 상태">
          <span>최근 상태</span>
          <ul>
            {viewModel.recentEvents.map((event) => (
              <li className={`is-${event.tone}`} key={event.label}>{event.label}</li>
            ))}
          </ul>
        </div>
    </div>
  );
}
