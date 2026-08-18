import { memo } from "react";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import { StreamTelemetryOverlay } from "@streaming/components/StreamTelemetryOverlay";
import { getStreamDisplayName } from "@streaming/presentation/streamPresentation";
import type { StreamSlot as DashboardStreamSlot } from "@streaming/layout/streamModel";

interface StreamWallTileProps {
  readonly index: number;
  readonly onSelect: (index: number, streamId: string | null) => void;
  readonly onToggleAi: (streamId: string) => void;
  readonly stream: DashboardStreamSlot | null;
  readonly streams: readonly DashboardStreamSlot[];
}

export const StreamWallTile = memo(function StreamWallTile({ index, onSelect, onToggleAi, stream, streams }: StreamWallTileProps) {
  return (
    <article className="stream-wall-tile" aria-label={`스트림 화면 ${index + 1}`}>
      {stream?.streamPath ? (
        <RealtimePlayer
          className="stream-wall-tile__player"
          controls={false}
          muted={index !== 0}
          streamId={stream.streamPath}
          title={getStreamDisplayName(stream)}
        />
      ) : (
        <div className="stream-wall-tile__empty" aria-hidden="true">
          <span />
          <p>표시할 스트림을 선택하세요</p>
        </div>
      )}

      <StreamTelemetryOverlay geometry={stream?.geometry} />

      <div className="stream-wall-tile__toolbar">
        <span className={`stream-wall-tile__status is-${stream?.status ?? "empty"}`} aria-hidden="true" />
        <label className="stream-wall-tile__picker">
          <span className="sr-only">{index + 1}번 화면 스트림 선택</span>
          <select value={stream?.id ?? ""} onChange={(event) => onSelect(index, event.target.value || null)}>
            <option value="">스트림 선택</option>
            {streams.map((option) => (
              <option key={option.id} value={option.id}>{getStreamDisplayName(option)}</option>
            ))}
          </select>
        </label>
        <button
          aria-label={`${index + 1}번 화면 AI 모드`}
          aria-pressed={Boolean(stream?.aiModeEnabled)}
          className="stream-wall-tile__ai"
          disabled={!stream}
          onClick={() => stream && onToggleAi(stream.id)}
          type="button"
        >
          AI
        </button>
      </div>
    </article>
  );
});
