import { useCallback, type MutableRefObject } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import type { WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { reconnectDelayForAttempt } from "@streaming/publisher/publisherReconnectPolicy";
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
  const scheduleReconnect = useReconnectScheduler(runtime, publishRef, stopGpsTelemetry, updateStatus);
  const suspendReconnect = useCallback((message: string): void => {
    if (!runtime.streamRef.current) return;
    clearReconnectTimer();
    stopGpsTelemetry();
    closePublisherPeerConnection(runtime.peerConnectionRef);
    runtime.reconnectStartedAtRef.current ??= performance.now();
    runtime.setFailedStep("media");
    runtime.setErrorMessage(message);
    updateStatus("reconnecting");
  }, [clearReconnectTimer, runtime, stopGpsTelemetry, updateStatus]);
  const handleConnectionChange = useCallback((peerConnection: RTCPeerConnection): void => {
    if (!isPublishedConnectionDisconnected(peerConnection) || runtime.statusRef.current !== "published") return;
    if (!navigator.onLine || document.visibilityState === "hidden") {
      suspendReconnect("네트워크 또는 화면 복귀 후 송출 재연결을 시도합니다.");
      return;
    }
    scheduleReconnect(`송출 미디어 연결이 끊겼습니다 (${peerConnection.connectionState}/${peerConnection.iceConnectionState}). 재연결을 시도합니다.`);
  }, [runtime.statusRef, scheduleReconnect, suspendReconnect]);
  const resetCapture = useCallback((): void => {
    if (runtime.statusRef.current !== "idle") {
      stopGpsTelemetry();
      clearPublisherSession(runtime.sessionRefs);
      updateStatus("idle");
    }
    runtime.setFailedStep(null);
    runtime.setErrorMessage(null);
  }, [runtime, stopGpsTelemetry, updateStatus]);
  return { clearReconnectTimer, handleConnectionChange, resetCapture, scheduleReconnect, stopAll, suspendReconnect } as const;
}

function useReconnectScheduler(
  runtime: LocalWebcamPublisherRuntime,
  publishRef: MutableRefObject<() => Promise<void>>,
  stopGpsTelemetry: () => void,
  updateStatus: (status: WebcamPublisherStatus) => void,
) {
  return useCallback((message: string): void => {
    if (!runtime.streamRef.current || runtime.reconnectTimeoutRef.current !== null) return;
    const delay = reconnectDelayForAttempt(runtime.reconnectAttemptRef.current);
    if (delay === null) {
      runtime.setFailedStep("media");
      runtime.setErrorMessage("자동 재연결 횟수를 초과했습니다. 카메라 준비 후 수동으로 다시 시도하세요.");
      updateStatus("error");
      return;
    }
    stopGpsTelemetry();
    closePublisherPeerConnection(runtime.peerConnectionRef);
    runtime.reconnectAttemptRef.current += 1;
    runtime.reconnectStartedAtRef.current ??= performance.now();
    runtime.setFailedStep("media");
    runtime.setErrorMessage(message);
    updateStatus("reconnecting");
    runtime.reconnectTimeoutRef.current = window.setTimeout(() => {
      runtime.reconnectTimeoutRef.current = null;
      void publishRef.current();
    }, delay);
  }, [publishRef, runtime, stopGpsTelemetry, updateStatus]);
}
