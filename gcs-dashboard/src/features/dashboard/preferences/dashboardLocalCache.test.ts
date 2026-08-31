import { afterEach, describe, expect, test, vi } from "vitest";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import {
  DASHBOARD_SYSTEM_STATUS_CACHE_TTL_MS,
  loadSystemStatusLocalCache,
  normalizeCachedServerStatus,
  normalizeRttHistory,
  saveSystemStatusLocalCache,
} from "@dashboard/preferences/dashboardLocalCache";

const NOW = 1_782_489_600_000;

describe("dashboardLocalCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("normalizes a fresh server status snapshot for local-first rendering", () => {
    expect(
      normalizeCachedServerStatus({
        apiServer: "online",
        authServer: "online",
        checkedAt: NOW,
        latencyMs: 42,
        readiness: "online",
        signalingServer: "online",
        streams: "online",
      }, NOW),
    ).toEqual({
      apiServer: DASHBOARD_SERVER_HEALTH.online,
      authServer: DASHBOARD_SERVER_HEALTH.online,
      checkedAt: NOW,
      latencyMs: 42,
      readiness: DASHBOARD_SERVER_HEALTH.online,
      signalingServer: DASHBOARD_SERVER_HEALTH.online,
      streams: DASHBOARD_SERVER_HEALTH.online,
    });
  });

  test("drops stale status snapshots instead of rendering outdated health as fresh", () => {
    const staleCheckedAt = NOW - DASHBOARD_SYSTEM_STATUS_CACHE_TTL_MS - 1;

    expect(normalizeCachedServerStatus({ checkedAt: staleCheckedAt, readiness: "online" }, NOW).checkedAt).toBeNull();
  });

  test("sanitizes invalid health and latency values", () => {
    const normalized = normalizeCachedServerStatus({
      apiServer: "offline",
      authServer: "bad",
      checkedAt: NOW,
      latencyMs: Number.NaN,
      readiness: "online",
      signalingServer: "error",
      streams: "degraded",
    }, NOW);

    expect(normalized.apiServer).toBe(DASHBOARD_SERVER_HEALTH.degraded);
    expect(normalized.authServer).toBe(DASHBOARD_SERVER_HEALTH.degraded);
    expect(normalized.latencyMs).toBeNull();
    expect(normalized.signalingServer).toBe(DASHBOARD_SERVER_HEALTH.error);
  });

  test("trims RTT history and removes malformed samples", () => {
    const samples = [
      { checkedAt: 0, latencyMs: 99 },
      { checkedAt: NOW - 2, latencyMs: 10 },
      { checkedAt: NOW - 1, latencyMs: "slow" },
      { checkedAt: NOW, latencyMs: 30 },
    ];

    expect(normalizeRttHistory(samples, 2)).toEqual([
      { checkedAt: NOW - 1, latencyMs: null },
      { checkedAt: NOW, latencyMs: 30 },
    ]);
  });

  test("persists and reloads the latest status and RTT history through IndexedDB", async () => {
    const fakeIndexedDB = createFakeIndexedDB();
    vi.stubGlobal("indexedDB", fakeIndexedDB.indexedDB);

    await saveSystemStatusLocalCache({
      apiServer: "online",
      authServer: "online",
      checkedAt: NOW,
      latencyMs: 38,
      readiness: "online",
      signalingServer: "online",
      streams: "online",
    }, [
      { checkedAt: NOW - 1, latencyMs: 44 },
      { checkedAt: NOW, latencyMs: 38 },
    ]);

    const loaded = await loadSystemStatusLocalCache(NOW);

    expect(loaded.status.latencyMs).toBe(38);
    expect(loaded.status.readiness).toBe(DASHBOARD_SERVER_HEALTH.online);
    expect(loaded.rttHistory).toEqual([
      { checkedAt: NOW - 1, latencyMs: 44 },
      { checkedAt: NOW, latencyMs: 38 },
    ]);
    expect(fakeIndexedDB.closedCount).toBe(2);
  });
});

function createFakeIndexedDB(): { indexedDB: IDBFactory; closedCount: number; records: Map<string, unknown> } {
  const records = new Map<string, unknown>();
  const state = { closedCount: 0 };
  const database = {
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: vi.fn(),
    transaction: () => ({
      objectStore: () => ({
        get: (key: IDBValidKey) => createSuccessRequest(() => records.get(String(key))),
        put: (value: unknown, key: IDBValidKey) =>
          createSuccessRequest(() => {
            records.set(String(key), value);
            return undefined;
          }),
      }),
    }),
    close: () => {
      state.closedCount += 1;
    },
  };

  return {
    indexedDB: ({
      open: () => {
        const request = createOpenRequest(database);
        queueMicrotask(() => {
          request.onsuccess?.call(request as IDBOpenDBRequest, new Event("success"));
        });
        return request as IDBOpenDBRequest;
      },
    } as unknown) as IDBFactory,
    get closedCount() {
      return state.closedCount;
    },
    records,
  };
}

function createOpenRequest(database: unknown): IDBOpenDBRequest {
  return {
    result: database,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
  } as unknown as IDBOpenDBRequest;
}

function createSuccessRequest<T>(resolveValue: () => T): IDBRequest<T> {
  const request: {
    result: T | undefined;
    onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
    onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
  } = {
    result: undefined as T | undefined,
    onerror: null,
    onsuccess: null,
  };
  queueMicrotask(() => {
    request.result = resolveValue();
    request.onsuccess?.call(request as unknown as IDBRequest<T>, new Event("success"));
  });
  return request as unknown as IDBRequest<T>;
}
