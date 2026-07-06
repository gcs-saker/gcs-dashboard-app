import { describe, expect, test } from "vitest";
import {
  canPersistQueryReadModel,
  QUERY_PERSISTENCE_POLICY,
} from "./queryPersistencePolicy";

describe("queryPersistencePolicy", () => {
  test("allows only non-sensitive read models to persist in IndexedDB", () => {
    expect(canPersistQueryReadModel("server-health-snapshot")).toBe(true);
    expect(canPersistQueryReadModel("rtt-history")).toBe(true);
    expect(canPersistQueryReadModel("access-token")).toBe(false);
    expect(canPersistQueryReadModel("permission-policy")).toBe(false);
  });

  test("keeps authorization-related queries memory-only or server revalidated", () => {
    expect(QUERY_PERSISTENCE_POLICY.memoryOnly).toEqual(
      expect.arrayContaining(["auth-principal", "permission-policy", "access-token"]),
    );
    expect(QUERY_PERSISTENCE_POLICY.serverRevalidateRequired).toEqual(
      expect.arrayContaining(["stream-control-permission", "device-command-authorization"]),
    );
  });
});
