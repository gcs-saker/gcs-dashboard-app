import { useEffect, type Dispatch, type SetStateAction } from "react";
import { consumeOperationalEventStream } from "@dashboard/operations/operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "@dashboard/operations/operationalEvents";
import {
  mergeOperationalEvents,
  rememberOperationalEventHistory,
} from "@dashboard/operations/operationalEventHistory";

interface OperationalEventSubscriptionInput {
  enabled: boolean;
  filters: OperationalEventFilters;
  fetcher: typeof fetch;
  filterKey: string;
  initialEvents: OperationalEvent[];
  setEvents: Dispatch<SetStateAction<OperationalEvent[]>>;
}

export function useOperationalEventSubscription(input: OperationalEventSubscriptionInput): void {
  const { enabled, fetcher, filterKey, filters, initialEvents, setEvents } = input;
  useEffect(() => {
    if (!enabled || typeof ReadableStream === "undefined") return undefined;
    const controller = new AbortController();
    const connection = createEventStreamConnection({
      enabled,
      fetcher,
      filterKey,
      filters,
      initialEvents,
      setEvents,
    }, controller);
    void connection.run();
    return () => controller.abort();
  }, [enabled, fetcher, filterKey, filters, initialEvents, setEvents]);
}

function createEventStreamConnection(
  input: OperationalEventSubscriptionInput,
  controller: AbortController,
) {
  let reconnectDelayMs = 1_000;
  let after = newestEventCursor(input.initialEvents);
  return {
    run: async (): Promise<void> => {
      while (!controller.signal.aborted) {
        try {
          await consumeOperationalEventStream(
            input.filters,
            { onEvent: (event) => {
              after = { id: event.id, occurredAt: event.occurredAt };
              appendEvent(input, event);
            } },
            { after, fetcher: input.fetcher, signal: controller.signal },
          );
          reconnectDelayMs = 1_000;
        } catch {
          if (controller.signal.aborted) return;
        }
        await abortableDelay(reconnectDelayMs, controller.signal);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
      }
    },
  };
}

function appendEvent(input: OperationalEventSubscriptionInput, event: OperationalEvent): void {
  input.setEvents((current) => {
    const merged = mergeOperationalEvents(current, [event]);
    rememberOperationalEventHistory(input.filterKey, merged);
    return merged;
  });
}

function newestEventCursor(events: OperationalEvent[]) {
  const newest = events[0];
  return newest ? { id: newest.id, occurredAt: newest.occurredAt } : null;
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      globalThis.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}
