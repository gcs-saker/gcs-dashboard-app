import { useEffect } from "react";

import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import type { WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { clearPublisherSession } from "@streaming/publisher/publisherSessionCleanup";

const MUTED_MESSAGE = "모바일 미디어 트랙이 일시적으로 mute 상태입니다.";

export function usePublisherTrackLifecycle(
  runtime: LocalWebcamPublisherRuntime,
  stopGpsTelemetry: () => void,
  updateStatus: (status: WebcamPublisherStatus) => void,
): void {
  useEffect(() => {
    if (runtime.status !== "published") return undefined;
    const tracks = runtime.streamRef.current?.getTracks() ?? [];
    const mute = (): void => runtime.setErrorMessage(MUTED_MESSAGE);
    const unmute = (): void => runtime.setErrorMessage((current) => current === MUTED_MESSAGE ? null : current);
    const ended = (): void => {
      stopGpsTelemetry();
      clearPublisherSession(runtime.sessionRefs);
      runtime.setFailedStep("camera");
      runtime.setErrorMessage("모바일 미디어 트랙이 종료되었습니다. 카메라 준비를 다시 실행하세요.");
      updateStatus("error");
    };
    const observableTracks = tracks.filter((track) => typeof track.addEventListener === "function");
    observableTracks.forEach((track) => {
      track.addEventListener("mute", mute);
      track.addEventListener("unmute", unmute);
      track.addEventListener("ended", ended);
    });
    return () => observableTracks.forEach((track) => {
      track.removeEventListener("mute", mute);
      track.removeEventListener("unmute", unmute);
      track.removeEventListener("ended", ended);
    });
  }, [runtime, stopGpsTelemetry, updateStatus]);
}
