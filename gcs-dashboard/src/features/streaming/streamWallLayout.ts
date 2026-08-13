import type { StreamSlot as DashboardStreamSlot } from "@streaming/streamModel";

export type StreamWallLayout = "2x2" | "3x3";

export const STREAM_WALL_SIZE: Record<StreamWallLayout, number> = {
  "2x2": 4,
  "3x3": 9,
};

export function reconcileStreamWallSlots(
  current: readonly (string | null)[],
  streams: readonly DashboardStreamSlot[],
  layout: StreamWallLayout,
): (string | null)[] {
  const size = STREAM_WALL_SIZE[layout];
  const availableIds = new Set(streams.map((stream) => stream.id));
  const next = Array.from({ length: size }, (_, index) => {
    const streamId = current[index];
    return streamId && availableIds.has(streamId) ? streamId : null;
  });
  const assigned = new Set(next.filter((streamId): streamId is string => Boolean(streamId)));
  const unassigned = streams.filter((stream) => !assigned.has(stream.id));

  return next.map((streamId) => streamId ?? unassigned.shift()?.id ?? null);
}
