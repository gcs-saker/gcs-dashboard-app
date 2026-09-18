import { useEffect } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";

interface PublisherBrowserRecoveryInput {
  runtime: LocalWebcamPublisherRuntime;
  scheduleReconnect: (message: string) => void;
  suspendReconnect: (message: string) => void;
  stopAll: () => void;
}

export function usePublisherBrowserRecovery({
  runtime,
  scheduleReconnect,
  suspendReconnect,
  stopAll,
}: PublisherBrowserRecoveryInput): void {
  useEffect(() => {
    const suspend = (): void => {
      if (runtime.statusRef.current !== "published") return;
      suspendReconnect("네트워크가 끊겼습니다. 연결 복구 후 송출을 재개합니다.");
    };
    const resume = (): void => {
      if (runtime.statusRef.current !== "reconnecting" || !navigator.onLine) return;
      scheduleReconnect("브라우저 또는 네트워크가 복구되어 송출 재연결을 시도합니다.");
    };
    const handleVisibility = (): void => {
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener("offline", suspend);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", stopAll);
    return () => {
      window.removeEventListener("offline", suspend);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", stopAll);
    };
  }, [runtime.statusRef, scheduleReconnect, stopAll, suspendReconnect]);
}
