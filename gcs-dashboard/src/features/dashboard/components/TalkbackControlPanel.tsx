import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  buildTalkbackSelectionViewModel,
  formatTalkbackMicLevel,
  isTalkbackActive,
  talkbackStatusText,
} from "@dashboard/streaming/talkbackPresentation";

interface TalkbackControlPanelProps {
  selectedStreamId: string;
  selectedStreamIds: string[];
  streams: DashboardStreamSlot[];
  talkback: TalkbackPublisherSnapshot;
}

export function TalkbackControlPanel({
  selectedStreamIds,
  streams,
  talkback,
}: TalkbackControlPanelProps) {
  const selection = buildTalkbackSelectionViewModel(streams, selectedStreamIds);
  const isActive = isTalkbackActive(talkback.status);

  return (
    <section className="talkback-panel" aria-label="다중 stream 음성 송신">
      <span className={`ops-badge talkback-panel__status talkback-panel__status--${talkback.status}`}>
        {talkbackStatusText(talkback.status)}
      </span>
      <span className="talkback-panel__targets">
        {selection.targetsText}
      </span>
      <span
        className={`talkback-panel__mic ${talkback.hasLocalAudioTrack ? "has-track" : ""}`}
        aria-label={`마이크 입력 ${formatTalkbackMicLevel(talkback.micLevel)}`}
      >
        <i style={{ width: `${Math.round((talkback.micLevel ?? 0) * 100)}%` }} />
        <em>{talkback.hasLocalAudioTrack ? `MIC ${formatTalkbackMicLevel(talkback.micLevel)}` : "MIC 대기"}</em>
      </span>
      <button
        className={`ops-command-button ${isActive ? "is-active" : ""}`}
        disabled={selection.selectedStreamPaths.length === 0 || isActive}
        onClick={() => void talkback.start(selection.selectedStreamPaths)}
        type="button"
      >
        마이크 송신
      </button>
      <button
        className="ops-command-button"
        disabled={!isActive && talkback.status !== "error"}
        onClick={talkback.stop}
        type="button"
      >
        송신 중지
      </button>
      {talkback.targets.length > 0 ? (
        <span className="talkback-panel__result">
          {talkback.targets.filter((target) => target.status === "active").length}/{talkback.targets.length}
        </span>
      ) : null}
      {talkback.errorMessage ? <span className="talkback-panel__error">{talkback.errorMessage}</span> : null}
    </section>
  );
}
