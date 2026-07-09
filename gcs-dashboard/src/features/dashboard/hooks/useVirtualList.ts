import { useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

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
  containerRef: (element: HTMLElement | null) => void;
  onScroll: (event: { currentTarget: HTMLElement }) => void;
  range: VirtualListRange;
} {
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  const containerRef = useCallback((element: HTMLElement | null): void => {
    setContainerElement(element);
    if (!element) return;
    setViewport((current) => {
      if (current.height === element.clientHeight && current.scrollTop === element.scrollTop) return current;
      return { height: element.clientHeight, scrollTop: element.scrollTop };
    });
  }, []);

  const onScroll = useCallback((event: { currentTarget: HTMLElement }): void => {
    const { clientHeight, scrollTop } = event.currentTarget;
    setViewport((current) => {
      if (current.height === clientHeight && current.scrollTop === scrollTop) return current;
      return { height: clientHeight, scrollTop };
    });
  }, []);

  useEffect(() => {
    if (!containerElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = Math.round(entry.contentRect.height);
      setViewport((current) => {
        if (current.height === nextHeight) return current;
        return { ...current, height: nextHeight };
      });
    });
    observer.observe(containerElement);
    return () => observer.disconnect();
  }, [containerElement]);

  const virtualizer = useVirtualizer({
    count: itemCount,
    estimateSize: () => itemHeight,
    getScrollElement: () => containerElement,
    initialRect: {
      height: itemHeight * VirtualListContract.INITIAL_VISIBLE_ROWS,
      width: VirtualListContract.INITIAL_WIDTH,
    },
    overscan,
  });

  const range = ((): VirtualListRange => {
    const visibleCount = Math.ceil((viewport.height || itemHeight * VirtualListContract.INITIAL_VISIBLE_ROWS) / itemHeight);
    const startIndex = Math.max(0, Math.floor(viewport.scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);
    return {
      endIndex,
      offsetTop: startIndex * itemHeight,
      startIndex,
      totalHeight: virtualizer.getTotalSize(),
    };
  })();

  return { containerRef, onScroll, range };
}

const VirtualListContract = {
  INITIAL_VISIBLE_ROWS: 8,
  INITIAL_WIDTH: 0,
} as const;
