interface IndexedDbStoreConfig {
  readonly dbName: string;
  readonly storeName: string;
  readonly version: number;
}

export async function readIndexedDbRecord(config: IndexedDbStoreConfig, key: string): Promise<unknown> {
  const database = await openIndexedDbStore(config);
  if (!database) return null;
  const record = await requestIndexedDbRecord(database, config.storeName, "readonly", (store) => store.get(key));
  database.close();
  return record;
}

export async function readIndexedDbRecords(
  config: IndexedDbStoreConfig,
  keys: readonly string[],
): Promise<unknown[]> {
  const database = await openIndexedDbStore(config);
  if (!database) return keys.map(() => null);
  const records = await Promise.all(
    keys.map((key) => requestIndexedDbRecord(database, config.storeName, "readonly", (store) => store.get(key))),
  );
  database.close();
  return records;
}

export async function writeIndexedDbRecord(
  config: IndexedDbStoreConfig,
  key: string,
  value: unknown,
): Promise<void> {
  const database = await openIndexedDbStore(config);
  if (!database) return;
  await requestIndexedDbRecord(database, config.storeName, "readwrite", (store) => store.put(value, key));
  database.close();
}

export async function writeIndexedDbRecords(
  config: IndexedDbStoreConfig,
  entries: readonly (readonly [key: string, value: unknown])[],
): Promise<void> {
  const database = await openIndexedDbStore(config);
  if (!database) return;
  await Promise.all(
    entries.map(([key, value]) =>
      requestIndexedDbRecord(database, config.storeName, "readwrite", (store) => store.put(value, key))),
  );
  database.close();
}

export async function openIndexedDbStore(config: IndexedDbStoreConfig): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(config.dbName, config.version);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- IDB request handler slots are single-owner and broadly supported.
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(config.storeName)) {
        database.createObjectStore(config.storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestIndexedDbRecord<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, mode);
    const request = requestFactory(transaction.objectStore(storeName));
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- IDB request handler slots are single-owner and broadly supported.
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}
