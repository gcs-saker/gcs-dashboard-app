import { useEffect } from "react";

import type { OperationalEvent } from "@dashboard/operations/operationalEvents";

export function useEventSelectionSync(
  events: readonly OperationalEvent[],
  selectedEventId: string | null,
  setSelectedEventId: (eventId: string | null) => void,
): void {
  useEffect(() => {
    const firstEventId = events[0]?.id ?? null;
    if (!selectedEventId) {
      if (firstEventId) setSelectedEventId(firstEventId);
      return;
    }
    if (!events.some((event) => event.id === selectedEventId)) setSelectedEventId(firstEventId);
  }, [events, selectedEventId, setSelectedEventId]);
}
