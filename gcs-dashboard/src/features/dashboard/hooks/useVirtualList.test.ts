import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useVirtualList } from "./useVirtualList";

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
});
