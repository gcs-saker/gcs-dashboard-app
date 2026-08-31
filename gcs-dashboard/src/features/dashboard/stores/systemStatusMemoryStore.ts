import { createStore } from "zustand/vanilla";
import { DEFAULT_SERVER_STATUS, type DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import type { RttSample } from "@dashboard/operations/systemStatusRtt";

export interface SystemStatusMemoryCache {
  rttHistory: RttSample[];
  status: DashboardServerStatusSnapshot;
}

const EMPTY_CACHE: SystemStatusMemoryCache = { rttHistory: [], status: DEFAULT_SERVER_STATUS };

export const systemStatusMemoryStore = createStore<SystemStatusMemoryCache>(() => EMPTY_CACHE);

export function resetSystemStatusMemoryStore(): void {
  systemStatusMemoryStore.setState(EMPTY_CACHE, true);
}
