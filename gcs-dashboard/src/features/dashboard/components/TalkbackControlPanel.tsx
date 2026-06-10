import { useMemo } from "react";

import { useWhipAudioPublisher, type UseWhipAudioPublisherOptions } from "../../streaming/hooks/useWhipAudioPublisher";
import type { DashboardStreamSlot } from "../streamTypes";
import { getDashboardStreamDisplayName } from "../streamTypes";

interface TalkbackControlPanelProps extends UseWhipAudioPublisherOptions {
  selectedStreamIds: string[];
  streams: DashboardStreamSlot[];
}

export function TalkbackControlPanel({
  selectedStreamIds,
  streams,
  ...publisherOptions
}: TalkbackControlPanelProps) {
  const talkback = useWhipAudioPublisher(publisherOptions);
  const selectedStreams = useMemo(
    () => streams.filter((stream) => stream.streamPath && selectedStreamIds.includes(stream.streamPath)),
    [selectedStreamIds, streams],
  );
  const selectedStreamPaths = selectedStreams.map((stream) => stream.streamPath).filter(Boolean) as string[];
  const isActive = talkback.status === "active" || talkback.status === "publishing" || talkback.status === "requesting-mic";

  return (
    <section className="talkback-panel" aria-label="다중 stream 음성 송신">
      <span className={`ops-badge talkback-panel__status talkback-panel__status--${talkback.status}`}>
        {talkbackStatusText(talkback.status)}
      </span>
      <span className="talkback-panel__targets">
        {selectedStreams.length > 0
          ? selectedStreams.map(getDashboardStreamDisplayName).join(", ")
          : "대상 없음"}
      </span>
      <button
        className={`ops-command-button ${isActive ? "is-active" : ""}`}
        disabled={selectedStreamPaths.length === 0 || isActive}
        onClick={() => void talkback.start(selectedStreamPaths)}
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

function talkbackStatusText(status: ReturnType<typeof useWhipAudioPublisher>["status"]): string {
  const labels: Record<ReturnType<typeof useWhipAudioPublisher>["status"], string> = {
    idle: "Talkback 대기",
    "requesting-mic": "마이크 권한",
    publishing: "송신 연결",
    active: "송신 중",
    error: "송신 오류",
  };
  return labels[status];
}
