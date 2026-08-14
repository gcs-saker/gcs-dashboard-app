import { afterEach, describe, expect, test, vi } from "vitest";
import { resetDashboardLayout } from "@dashboard/layout/dashboardLayout";
import {
  createDashboardUserPreferenceKey,
  createDefaultDashboardUserPreferences,
  type DashboardUserPreferences,
  normalizeDashboardUserPreferences,
} from "@dashboard/preferences/userPreferences";
import { sanitizeDashboardPreferencesForStorage } from "@dashboard/preferences/userPreferencesStore";
import { loadDashboardUserPreferences, saveDashboardUserPreferences } from "@dashboard/preferences/userPreferencesStore";

describe("userPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("scopes browser preferences by a sanitized username", () => {
    expect(createDashboardUserPreferenceKey("operator01")).toBe("dashboard:operator01");
    expect(createDashboardUserPreferenceKey("unit/a@ops")).toBe("dashboard:unit_a_ops");
    expect(createDashboardUserPreferenceKey(null)).toBe("dashboard:preview");
  });

  test("normalizes persisted dashboard settings without trusting malformed records", () => {
    const defaultLayout = resetDashboardLayout();
    const preferences = normalizeDashboardUserPreferences({
      activeView: "cctv",
      cctvLayoutMode: "5x5",
      cctvQualityMode: "high",
      motionMode: "off",
      layout: [
        {
          ...defaultLayout[0],
          defaultPosition: { column: -1, columnSpan: 2, row: 0, rowSpan: 3 },
          pinned: true,
          visible: false,
        },
        { id: "unknown-widget", visible: true },
      ],
      streamPreferences: {
        deviceAliases: {
          "raw.sample.front": "전방 카메라",
          invalid: 42,
        },
      },
    });

    expect(preferences.activeView).toBe("cctv");
    expect(preferences.cctvLayoutMode).toBe("5x5");
    expect(preferences.cctvQualityMode).toBe("high");
    expect(preferences.motionMode).toBe("off");
    expect(preferences.layout).toHaveLength(defaultLayout.length);
    expect(preferences.layout[0]).toEqual(
      expect.objectContaining({
        defaultPosition: expect.objectContaining({ column: 1, columnSpan: 2, row: 1, rowSpan: 3 }),
        id: defaultLayout[0].id,
        pinned: true,
        visible: false,
      }),
    );
    expect(preferences.streamPreferences.deviceAliases).toEqual({
      "raw.sample.front": "전방 카메라",
    });
  });

  test("falls back to default preferences when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(loadDashboardUserPreferences("dashboard:operator01")).resolves.toEqual(
      createDefaultDashboardUserPreferences(),
    );
    await expect(saveDashboardUserPreferences("dashboard:operator01", createDefaultDashboardUserPreferences())).resolves.toBeUndefined();
  });

  test("persists and reloads dashboard settings through IndexedDB", async () => {
    const fakeIndexedDB = createFakeIndexedDB();
    vi.stubGlobal("indexedDB", fakeIndexedDB.indexedDB);
    const saved: DashboardUserPreferences = {
      ...createDefaultDashboardUserPreferences(),
      activeView: "events",
      cctvLayoutMode: "4x4",
      streamPreferences: {
        deviceAliases: {
          "raw.mobile.front": "전방 단말",
        },
      },
    };

    await saveDashboardUserPreferences("dashboard:operator01", saved);
    const loaded = await loadDashboardUserPreferences("dashboard:operator01");

    expect(loaded.activeView).toBe("events");
    expect(loaded.cctvLayoutMode).toBe("4x4");
    expect(loaded.streamPreferences.deviceAliases).toEqual({
      "raw.mobile.front": "전방 단말",
    });
    expect(fakeIndexedDB.closedCount).toBe(2);
  });

  test("sanitizes forbidden auth and secret fields before saving browser preferences", async () => {
    const fakeIndexedDB = createFakeIndexedDB();
    vi.stubGlobal("indexedDB", fakeIndexedDB.indexedDB);
    const unsafePreferences = {
      ...createDefaultDashboardUserPreferences(),
      activeView: "settings",
      accessToken: "must-not-persist",
      password: "must-not-persist",
      privateKey: "must-not-persist",
      refreshToken: "must-not-persist",
      serverSecret: "must-not-persist",
    } as unknown as DashboardUserPreferences;

    await saveDashboardUserPreferences("dashboard:operator01", unsafePreferences);

    expect(JSON.stringify(fakeIndexedDB.records.get("dashboard:operator01"))).not.toContain("must-not-persist");
    expect(fakeIndexedDB.records.get("dashboard:operator01")).toEqual(
      expect.objectContaining({
        activeView: "settings",
        version: 1,
      }),
    );
  });

  test("exposes preference sanitizer for migration and fallback paths", () => {
    const sanitized = sanitizeDashboardPreferencesForStorage({
      activeView: "events",
      cctvLayoutMode: "unknown",
      motionMode: "reduced",
      streamPreferences: {
        deviceAliases: {
          "raw.mobile.front": "전방 단말",
        },
      },
      refreshToken: "must-not-persist",
    });

    expect(sanitized.activeView).toBe("events");
    expect(sanitized.cctvLayoutMode).toBe("4x4");
    expect(sanitized.motionMode).toBe("reduced");
    expect(JSON.stringify(sanitized)).not.toContain("must-not-persist");
    expect(sanitized.streamPreferences.deviceAliases).toEqual({
      "raw.mobile.front": "전방 단말",
    });
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
