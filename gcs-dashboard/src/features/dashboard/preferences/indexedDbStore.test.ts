import { afterEach, describe, expect, test, vi } from "vitest";
import {
  openIndexedDbStore,
  readIndexedDbRecord,
  readIndexedDbRecords,
  writeIndexedDbRecord,
  writeIndexedDbRecords,
} from "@dashboard/preferences/indexedDbStore";

const STORE_CONFIG = Object.freeze({
  dbName: "test-db",
  storeName: "records",
  version: 1,
});

describe("indexedDbStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns null when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(openIndexedDbStore(STORE_CONFIG)).resolves.toBeNull();
    await expect(readIndexedDbRecord(STORE_CONFIG, "missing")).resolves.toBeNull();
    await expect(readIndexedDbRecords(STORE_CONFIG, ["a", "b"])).resolves.toEqual([null, null]);
    await expect(writeIndexedDbRecord(STORE_CONFIG, "a", 1)).resolves.toBeUndefined();
  });

  test("creates the object store during upgrade and reads/writes records", async () => {
    const fakeIndexedDB = createFakeIndexedDB({ shouldUpgrade: true });
    vi.stubGlobal("indexedDB", fakeIndexedDB.indexedDB);

    await writeIndexedDbRecord(STORE_CONFIG, "first", { ok: true });
    await writeIndexedDbRecords(STORE_CONFIG, [["second", 2], ["third", 3]]);

    await expect(readIndexedDbRecord(STORE_CONFIG, "first")).resolves.toEqual({ ok: true });
    await expect(readIndexedDbRecords(STORE_CONFIG, ["second", "third"])).resolves.toEqual([2, 3]);
    expect(fakeIndexedDB.createObjectStore).toHaveBeenCalledWith("records");
    expect(fakeIndexedDB.closedCount).toBe(4);
  });

  test("swallows open and request errors as null-safe storage failures", async () => {
    vi.stubGlobal("indexedDB", createFailingOpenIndexedDB());
    await expect(readIndexedDbRecord(STORE_CONFIG, "first")).resolves.toBeNull();

    vi.stubGlobal("indexedDB", createFakeIndexedDB({ failRequests: true }).indexedDB);
    await expect(readIndexedDbRecord(STORE_CONFIG, "first")).resolves.toBeNull();
    await expect(writeIndexedDbRecord(STORE_CONFIG, "first", 1)).resolves.toBeUndefined();
  });
});

function createFailingOpenIndexedDB(): IDBFactory {
  return ({
    open: () => {
      const request = createOpenRequest({});
      queueMicrotask(() => request.onerror?.call(request as IDBOpenDBRequest, new Event("error")));
      return request as IDBOpenDBRequest;
    },
  } as unknown) as IDBFactory;
}

function createFakeIndexedDB(options: { failRequests?: boolean; shouldUpgrade?: boolean } = {}) {
  const records = new Map<string, unknown>();
  const state = { closedCount: 0 };
  const createObjectStore = vi.fn();
  const database = {
    objectStoreNames: { contains: () => !options.shouldUpgrade },
    createObjectStore,
    transaction: () => ({
      objectStore: () => ({
        get: (key: IDBValidKey) => createRequest(() => records.get(String(key)), options.failRequests),
        put: (value: unknown, key: IDBValidKey) =>
          createRequest(() => {
            records.set(String(key), value);
            return undefined;
          }, options.failRequests),
      }),
    }),
    close: () => {
      state.closedCount += 1;
    },
  };

  return {
    createObjectStore,
    indexedDB: ({
      open: () => {
        const request = createOpenRequest(database);
        queueMicrotask(() => {
          if (options.shouldUpgrade) {
            request.onupgradeneeded?.call(
              request as IDBOpenDBRequest,
              new Event("upgrade") as IDBVersionChangeEvent,
            );
          }
          request.onsuccess?.call(request as IDBOpenDBRequest, new Event("success"));
        });
        return request as IDBOpenDBRequest;
      },
    } as unknown) as IDBFactory,
    get closedCount() {
      return state.closedCount;
    },
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

function createRequest<T>(resolveValue: () => T, shouldFail = false): IDBRequest<T> {
  const request = {
    result: undefined as T | undefined,
    onerror: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
    onsuccess: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
  };
  queueMicrotask(() => {
    if (shouldFail) {
      request.onerror?.call(request as unknown as IDBRequest<T>, new Event("error"));
      return;
    }
    request.result = resolveValue();
    request.onsuccess?.call(request as unknown as IDBRequest<T>, new Event("success"));
  });
  return request as unknown as IDBRequest<T>;
}
