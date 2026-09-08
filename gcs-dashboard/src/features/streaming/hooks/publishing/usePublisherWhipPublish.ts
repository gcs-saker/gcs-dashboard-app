import { useCallback } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import type { PublisherStepId, WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { closePublisherPeerConnection } from "@streaming/publisher/publisherSessionCleanup";
import { PublisherWhipSessionError, startPublisherWhipSession } from "@streaming/publisher/publisherWhipSession";

interface PublisherWhipPublishInput {
  clearReconnectTimer: () => void;
  fetcher: typeof fetch;
  handleConnectionChange: (peerConnection: RTCPeerConnection) => void;
  peerConnectionFactory?: () => RTCPeerConnection;
  runtime: LocalWebcamPublisherRuntime;
  startGpsTelemetry: () => void;
  stopGpsTelemetry: () => void;
  streamId: string;
  updateStatus: (status: WebcamPublisherStatus) => void;
}

export function usePublisherWhipPublish(input: PublisherWhipPublishInput) {
  return useCallback(async (): Promise<void> => {
    const { runtime } = input;
    if (!runtime.streamRef.current) {
      updatePublishError(runtime, input.updateStatus, "camera", "송출 전 카메라 미리보기를 먼저 준비해야 합니다.");
      return;
    }
    try {
      input.clearReconnectTimer();
      closePublisherPeerConnection(runtime.peerConnectionRef);
      runtime.setFailedStep(null);
      await startPublisherWhipSession({
        fetcher: input.fetcher,
        mediaStream: runtime.streamRef.current,
        onConnectionChange: input.handleConnectionChange,
        onPeerConnection: (connection) => { runtime.peerConnectionRef.current = connection; },
        onStatus: input.updateStatus,
        peerConnectionFactory: input.peerConnectionFactory,
        streamId: input.streamId,
      });
      runtime.setErrorMessage(null);
      runtime.reconnectAttemptRef.current = 0;
      input.updateStatus("published");
      input.startGpsTelemetry();
    } catch (error) {
      closePublisherPeerConnection(runtime.peerConnectionRef);
      input.stopGpsTelemetry();
      const step = error instanceof PublisherWhipSessionError ? error.step : "media";
      const message = error instanceof Error ? error.message : "로컬 웹캠 송출에 실패했습니다.";
      updatePublishError(runtime, input.updateStatus, step, message);
    }
  }, [input]);
}

function updatePublishError(
  runtime: LocalWebcamPublisherRuntime,
  updateStatus: (status: WebcamPublisherStatus) => void,
  step: PublisherStepId,
  message: string,
): void {
  updateStatus("error");
  runtime.setFailedStep(step);
  runtime.setErrorMessage(message);
}
