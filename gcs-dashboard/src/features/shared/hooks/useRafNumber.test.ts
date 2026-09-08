import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRafNumber } from "@/features/shared/hooks/useRafNumber";

describe("useRafNumber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commits immediately when animation is disabled", () => {
    const { result, rerender } = renderHook(({ value, enabled }) => useRafNumber(value, enabled), {
      initialProps: { enabled: false, value: 10 },
    });

    rerender({ enabled: false, value: 42 });

    expect(result.current).toBe(42);
  });

  it("batches updates through requestAnimationFrame when enabled", () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 7;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { result, rerender } = renderHook(({ value, enabled }) => useRafNumber(value, enabled), {
      initialProps: { enabled: true, value: 10 },
    });

    rerender({ enabled: true, value: 50 });
    expect(result.current).toBe(10);

    act(() => rafCallback?.(16));

    expect(result.current).toBe(50);
  });

  it("cancels pending animation frame on unmount", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 7));
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const { unmount } = renderHook(() => useRafNumber(10, true));
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
});
