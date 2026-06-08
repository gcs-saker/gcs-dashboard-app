import type { ReactNode } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import { STREAM_GRID_WIDGET } from "../streamTypes";
import { StreamCard } from "./StreamCard";
import { StreamPanelErrorBoundary } from "./StreamPanelErrorBoundary";

interface StreamGridProps {
  streams: DashboardStreamSlot[];
  selectedStreamId: string;
  audioActiveStreamId?: string | null;
  onSelectStream: (streamId: string) => void;
  renderCard?: (stream: DashboardStreamSlot, isSelected: boolean) => ReactNode;
}

export function StreamGrid({
  streams,
  selectedStreamId,
  audioActiveStreamId = null,
  onSelectStream,
  renderCard,
}: StreamGridProps) {
  return (
    <section
      aria-label="다중 스트림"
      className="stream-grid"
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
                isSelected={isSelected}
                onSelect={onSelectStream}
                stream={stream}
              />
            )}
          </StreamPanelErrorBoundary>
        );
      })}
    </section>
  );
}
