import { afterEach, describe, expect, test, vi } from "vitest";
import {
  loadStreamDeviceAliases,
  saveStreamDeviceAliases,
} from "@dashboard/assets/streamAliasRepository";

const records = new Map<string, unknown>();

vi.mock("@dashboard/preferences/indexedDbStore", () => ({
  readIndexedDbRecord: vi.fn(async (_config: unknown, key: string) => records.get(key) ?? null),
  writeIndexedDbRecord: vi.fn(async (_config: unknown, key: string, value: unknown) => {
    records.set(key, value);
  }),
}));

describe("streamAliasRepository", () => {
  afterEach(() => {
    records.clear();
  });

  test("persists stream aliases in a dedicated browser-visible store", async () => {
    await saveStreamDeviceAliases("dashboard:operator01", {
      "raw.mobile.front": "전방 단말",
      "raw.mobile.rear": "후방 단말",
    });

    await expect(loadStreamDeviceAliases("dashboard:operator01")).resolves.toEqual({
      "raw.mobile.front": "전방 단말",
      "raw.mobile.rear": "후방 단말",
    });
  });

  test("normalizes malformed persisted alias records", async () => {
    records.set("dashboard:operator01", {
      deviceAliases: {
        "raw.mobile.front": "전방 단말",
        invalid: 42,
      },
    });

    await expect(loadStreamDeviceAliases("dashboard:operator01")).resolves.toEqual({
      "raw.mobile.front": "전방 단말",
    });
  });
});
