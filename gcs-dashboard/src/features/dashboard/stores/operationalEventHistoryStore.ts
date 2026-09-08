import { createStore } from "zustand/vanilla";
import type { OperationalEvent } from "@dashboard/operations/operationalEvents";

interface OperationalEventHistoryState {
  histories: Map<string, OperationalEvent[]>;
}

export const operationalEventHistoryStore = createStore<OperationalEventHistoryState>(() => ({ histories: new Map() }));

export function clearOperationalEventHistories(): void {
  operationalEventHistoryStore.setState({ histories: new Map() }, true);
}

export function replaceOperationalEventHistories(histories: Map<string, OperationalEvent[]>): void {
  operationalEventHistoryStore.setState({ histories }, true);
}
