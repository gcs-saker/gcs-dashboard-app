import { useCallback } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import { audioCaptureConstraints, videoCaptureConstraints } from "@streaming/publisher/publisherMediaConstraints";
import type { WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";

export function usePublisherPreview(
  runtime: LocalWebcamPublisherRuntime,
  mediaDevices: MediaDevices | undefined,
  refreshMediaDevices: () => Promise<void>,
  updateStatus: (status: WebcamPublisherStatus) => void,
) {
  return useCallback(async (): Promise<void> => {
    if (!mediaDevices?.getUserMedia) {
      updateStatus("unsupported");
      runtime.setFailedStep("camera");
      runtime.setErrorMessage("이 브라우저에서는 카메라 캡처를 지원하지 않습니다.");
      return;
    }
    try {
      runtime.setFailedStep(null);
      updateStatus("requesting-camera");
      const stream = await mediaDevices.getUserMedia({
        video: videoCaptureConstraints(runtime.selectedVideoDeviceId),
        audio: audioCaptureConstraints(runtime.audioMode, runtime.selectedAudioDeviceId),
      });
      runtime.streamRef.current = stream;
      if (runtime.videoRef.current) runtime.videoRef.current.srcObject = stream;
      void refreshMediaDevices();
      runtime.setErrorMessage(null);
      updateStatus("previewing");
    } catch (error) {
      updateStatus("error");
      runtime.setFailedStep("camera");
      runtime.setErrorMessage(error instanceof Error ? error.message : "카메라 권한을 받을 수 없습니다.");
    }
  }, [mediaDevices, refreshMediaDevices, runtime, updateStatus]);
}
