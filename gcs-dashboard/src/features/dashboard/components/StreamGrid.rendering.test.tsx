import { memo } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_DASHBOARD_STREAMS, type DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import { StreamGrid } from "./StreamGrid";

const renderCounts = new Map<string, number>();

const ProbeStreamCard = memo(function ProbeStreamCard({
  isSelected,
  stream,
}: {
  isSelected: boolean;
  stream: DashboardStreamSlot;
}) {
  renderCounts.set(stream.id, (renderCounts.get(stream.id) ?? 0) + 1);
  return <button aria-pressed={isSelected} type="button">{stream.title}</button>;
});

describe("StreamGrid rendering contract", () => {
  it("re-renders only the stream card whose status payload changed", () => {
    renderCounts.clear();
    const streams = DEFAULT_DASHBOARD_STREAMS.slice(0, 3);
    const renderCard = (stream: DashboardStreamSlot, isSelected: boolean) => (
      <ProbeStreamCard isSelected={isSelected} stream={stream} />
    );
    const { rerender } = render(
      <StreamGrid
        onSelectStream={() => undefined}
        renderCard={renderCard}
        selectedStreamId={streams[0].id}
        streams={streams}
      />,
    );
    const nextStreams = [
      streams[0],
      { ...streams[1], status: DASHBOARD_STREAM_STATUS.error },
      streams[2],
    ];

    rerender(
      <StreamGrid
        onSelectStream={() => undefined}
        renderCard={renderCard}
        selectedStreamId={streams[0].id}
        streams={nextStreams}
      />,
    );

    expect(renderCounts.get(streams[0].id)).toBe(1);
    expect(renderCounts.get(streams[1].id)).toBe(2);
    expect(renderCounts.get(streams[2].id)).toBe(1);
  });
});
