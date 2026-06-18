import { useCallback, useMemo, useState } from "react";

export interface VirtualListRange {
  endIndex: number;
  offsetTop: number;
  startIndex: number;
  totalHeight: number;
}

export interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 4,
}: UseVirtualListOptions): {
  onScroll: (event: { currentTarget: HTMLElement }) => void;
  range: VirtualListRange;
} {
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  const onScroll = useCallback((event: { currentTarget: HTMLElement }): void => {
    const { clientHeight, scrollTop } = event.currentTarget;
    setViewport((current) => {
      if (current.height === clientHeight && current.scrollTop === scrollTop) return current;
      return { height: clientHeight, scrollTop };
    });
  }, []);

  const range = useMemo((): VirtualListRange => {
    const visibleCount = Math.ceil((viewport.height || itemHeight * 8) / itemHeight);
    const startIndex = Math.max(0, Math.floor(viewport.scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);
    return {
      endIndex,
      offsetTop: startIndex * itemHeight,
      startIndex,
      totalHeight: itemCount * itemHeight,
    };
  }, [itemCount, itemHeight, overscan, viewport.height, viewport.scrollTop]);

  return { onScroll, range };
}
