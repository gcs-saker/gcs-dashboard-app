import { useEffect } from "react";
import { preloadDashboardLazyViews } from "@dashboard/dashboardLazyViews";

export function useDashboardChunkPreload(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadDashboardLazyViews, { timeout: 2600 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = globalThis.setTimeout(preloadDashboardLazyViews, 1600);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);
}
