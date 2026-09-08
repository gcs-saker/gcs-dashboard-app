import { useCallback, type MutableRefObject } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import { RECONNECT_DELAYS_MS, type WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { isPublishedConnectionDisconnected } from "@streaming/publisher/publisherConnectionState";
import { clearPublisherReconnectTimer, clearPublisherSession, closePublisherPeerConnection } from "@streaming/publisher/publisherSessionCleanup";

export function usePublisherConnectionRecovery(
  runtime: LocalWebcamPublisherRuntime,
  publishRef: MutableRefObject<() => Promise<void>>,
  stopGpsTelemetry: () => void,
  updateStatus: (status: WebcamPublisherStatus) => void,
) {
  const clearReconnectTimer = useCallback(
    (): void => clearPublisherReconnectTimer(runtime.reconnectTimeoutRef),
    [runtime.reconnectTimeoutRef],
  );
  const stopAll = useCallback((): void => {
    stopGpsTelemetry();
    clearPublisherSession(runtime.sessionRefs);
    updateStatus("idle");
    runtime.setFailedStep(null);
  }, [runtime, stopGpsTelemetry, updateStatus]);
  const scheduleReconnect = useCallback((message: string): void => {
    if (!runtime.streamRef.current || runtime.reconnectTimeoutRef.current !== null) return;
    stopGpsTelemetry();
    closePublisherPeerConnection(runtime.peerConnectionRef);
    const attempt = Math.min(runtime.reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1);
    runtime.reconnectAttemptRef.current += 1;
    runtime.setFailedStep("media");
    runtime.setErrorMessage(message);
    updateStatus("reconnecting");
    runtime.reconnectTimeoutRef.current = window.setTimeout(() => {
      runtime.reconnectTimeoutRef.current = null;
      void publishRef.current();
    }, RECONNECT_DELAYS_MS[attempt]);
  }, [publishRef, runtime, stopGpsTelemetry, updateStatus]);
  const handleConnectionChange = useCallback((peerConnection: RTCPeerConnection): void => {
    if (!isPublishedConnectionDisconnected(peerConnection) || runtime.statusRef.current !== "published") return;
    scheduleReconnect(`송출 미디어 연결이 끊겼습니다 (${peerConnection.connectionState}/${peerConnection.iceConnectionState}). 재연결을 시도합니다.`);
  }, [runtime.statusRef, scheduleReconnect]);
  const resetCapture = useCallback((): void => {
    if (runtime.statusRef.current !== "idle") {
      stopGpsTelemetry();
      clearPublisherSession(runtime.sessionRefs);
      updateStatus("idle");
    }
    runtime.setFailedStep(null);
    runtime.setErrorMessage(null);
  }, [runtime, stopGpsTelemetry, updateStatus]);
  return { clearReconnectTimer, handleConnectionChange, resetCapture, stopAll } as const;
}
