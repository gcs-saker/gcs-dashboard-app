import { registerSessionScopedCache } from "@features/sessionScopedCache";
import type { OperationalEvent } from "@dashboard/operations/operationalEvents";
import {
  clearOperationalEventHistories,
  operationalEventHistoryStore,
  replaceOperationalEventHistories,
} from "@dashboard/stores/operationalEventHistoryStore";

const OPERATIONAL_EVENT_HISTORY_LIMIT = 500;
const OPERATIONAL_EVENT_FILTER_HISTORY_LIMIT = 20;

export function resetOperationalEventHistory(): void {
  clearOperationalEventHistories();
}

registerSessionScopedCache(resetOperationalEventHistory);

export function readOperationalEventHistory(filterKey: string): OperationalEvent[] {
  const histories = new Map(operationalEventHistoryStore.getState().histories);
  const cached = histories.get(filterKey);
  if (!cached) return [];
  histories.delete(filterKey);
  histories.set(filterKey, cached);
  replaceOperationalEventHistories(histories);
  return cached;
}

export function rememberOperationalEventHistory(filterKey: string, events: OperationalEvent[]): void {
  const histories = new Map(operationalEventHistoryStore.getState().histories);
  histories.delete(filterKey);
  histories.set(filterKey, events);
  while (histories.size > OPERATIONAL_EVENT_FILTER_HISTORY_LIMIT) {
    const oldestKey = histories.keys().next().value;
    if (typeof oldestKey !== "string") break;
    histories.delete(oldestKey);
  }
  replaceOperationalEventHistories(histories);
}

export function mergeOperationalEvents(previous: OperationalEvent[], incoming: OperationalEvent[]): OperationalEvent[] {
  const byId = new Map<string, OperationalEvent>();
  for (const event of previous) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return Array.from(byId.values())
    // oxlint-disable-next-line unicorn/no-array-sort -- The ES2022 browser target requires sorting an owned copy.
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, OPERATIONAL_EVENT_HISTORY_LIMIT);
}
