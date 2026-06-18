import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useVirtualList } from "./useVirtualList";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useVirtualList", () => {
  test("renders only the visible window with overscan", () => {
    const { result } = renderHook(() => useVirtualList({ itemCount: 1000, itemHeight: 40, overscan: 2 }));

    expect(result.current.range).toEqual({
      endIndex: 12,
      offsetTop: 0,
      startIndex: 0,
      totalHeight: 40000,
    });

    act(() => {
      result.current.onScroll({
        currentTarget: {
          clientHeight: 200,
          scrollTop: 400,
        } as HTMLElement,
      });
    });

    expect(result.current.range).toEqual({
      endIndex: 17,
      offsetTop: 320,
      startIndex: 8,
      totalHeight: 40000,
    });
  });

  test("measures the container height through ref and resize observer", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const { result } = renderHook(() => useVirtualList({ itemCount: 100, itemHeight: 50, overscan: 1 }));
    const element = { clientHeight: 500, scrollTop: 0 } as HTMLElement;

    act(() => result.current.containerRef(element));

    expect(observe).toHaveBeenCalledWith(element);
    expect(result.current.range.endIndex).toBe(12);

    act(() => {
      resizeCallback?.([{ contentRect: { height: 250 } } as ResizeObserverEntry], {} as ResizeObserver);
    });

    expect(result.current.range.endIndex).toBe(7);
  });
});
