import { memo, useMemo, type ReactNode } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import { STREAM_GRID_WIDGET } from "../streamTypes";
import { StreamCard } from "./StreamCard";
import { StreamPanelErrorBoundary } from "./StreamPanelErrorBoundary";

interface StreamGridProps {
  streams: DashboardStreamSlot[];
  selectedStreamId: string;
  audioActiveStreamId?: string | null;
  className?: string;
  talkbackTargetStreamIds?: string[];
  onSelectStream: (streamId: string) => void;
  onToggleTalkbackTarget?: (streamPath: string) => void;
  renderCard?: (stream: DashboardStreamSlot, isSelected: boolean) => ReactNode;
}

export const StreamGrid = memo(function StreamGrid({
  streams,
  selectedStreamId,
  audioActiveStreamId = null,
  className = "",
  talkbackTargetStreamIds = [],
  onSelectStream,
  onToggleTalkbackTarget,
  renderCard,
}: StreamGridProps) {
  const talkbackTargetPaths = useMemo(() => new Set(talkbackTargetStreamIds), [talkbackTargetStreamIds]);

  return (
    <section
      aria-label="다중 스트림"
      className={`stream-grid ${className}`.trim()}
      data-widget-id={STREAM_GRID_WIDGET.id}
      style={{ minHeight: STREAM_GRID_WIDGET.minHeight }}
    >
      {streams.map((stream) => {
        const isSelected = stream.id === selectedStreamId;
        return (
          <StreamPanelErrorBoundary fallbackLabel={stream.title} key={stream.id}>
            {renderCard ? (
              renderCard(stream, isSelected)
            ) : (
              <StreamCard
                hasAudioActivity={stream.id === audioActiveStreamId}
                isTalkbackTarget={Boolean(stream.streamPath && talkbackTargetPaths.has(stream.streamPath))}
                isSelected={isSelected}
                onSelect={onSelectStream}
                onToggleTalkbackTarget={onToggleTalkbackTarget}
                stream={stream}
              />
            )}
          </StreamPanelErrorBoundary>
        );
      })}
    </section>
  );
});
