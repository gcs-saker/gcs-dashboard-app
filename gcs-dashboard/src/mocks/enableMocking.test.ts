import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { enableMocking } from "./enableMocking";

const workerMock = vi.hoisted(() => ({
  start: vi.fn(() => Promise.resolve()),
}));

vi.mock("./browser", () => ({
  worker: workerMock,
}));

describe("MSW browser activation boundary", () => {
  beforeEach(() => {
    workerMock.start.mockClear();
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/");
  });

  test("does not start on local dev pages unless preview or env flag is explicit", async () => {
    await enableMocking();

    expect(workerMock.start).not.toHaveBeenCalled();
  });

  test("starts for local uiPreview pages", async () => {
    window.history.pushState({}, "", "/?uiPreview=1");

    await enableMocking();

    expect(workerMock.start).toHaveBeenCalledWith({
      onUnhandledRequest: "bypass",
      quiet: true,
    });
  });

  test("starts when VITE_ENABLE_MSW is explicitly enabled", async () => {
    vi.stubEnv("VITE_ENABLE_MSW", "true");

    await enableMocking();

    expect(workerMock.start).toHaveBeenCalledTimes(1);
  });
});
