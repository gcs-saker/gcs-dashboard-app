import { describe, expect, test, vi } from "vitest";
import { clearSessionScopedCaches, registerSessionScopedCache } from "./sessionScopedCache";

describe("sessionScopedCache", () => {
  test("clears every registered feature cache", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerSessionScopedCache(first);
    registerSessionScopedCache(second);

    clearSessionScopedCaches();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
