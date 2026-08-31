import { useEffect, useRef } from "react";
import type { LocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import { fetchCameraControlCommand, type CameraFacingMode } from "@streaming/publisher/cameraControlApi";
import { FRONT_CAMERA_DEVICE_ID, REAR_CAMERA_DEVICE_ID } from "@streaming/publisher/publisherContracts";
import { videoCaptureConstraints } from "@streaming/publisher/publisherMediaConstraints";

const CAMERA_COMMAND_INTERVAL_MS = 2_000;

export function useRemoteCameraControl(input: {
  enabled: boolean;
  fetcher: typeof fetch;
  mediaDevices?: MediaDevices;
  runtime: LocalWebcamPublisherRuntime;
  streamId: string;
}): void {
  const { enabled, fetcher, mediaDevices, runtime, streamId } = input;
  const lastRevisionRef = useRef(0);
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  useEffect(() => {
    if (!enabled || !mediaDevices?.getUserMedia || !streamId) return undefined;
    lastRevisionRef.current = 0;
    let active = true;
    let timeoutId: number | null = null;
    let consecutiveFailures = 0;
    const check = async (): Promise<void> => {
      consecutiveFailures = await checkCameraCommand({
        active: () => active,
        consecutiveFailures,
        fetcher,
        lastRevisionRef,
        mediaDevices,
        runtime: runtimeRef.current,
        streamId,
      });
      if (active) timeoutId = window.setTimeout(() => void check(), CAMERA_COMMAND_INTERVAL_MS);
    };
    void check();
    return () => {
      active = false;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [enabled, fetcher, mediaDevices, streamId]);
}

async function checkCameraCommand(input: {
  active: () => boolean;
  consecutiveFailures: number;
  fetcher: typeof fetch;
  lastRevisionRef: { current: number };
  mediaDevices: MediaDevices;
  runtime: LocalWebcamPublisherRuntime;
  streamId: string;
}): Promise<number> {
  try {
    const command = await fetchCameraControlCommand(input.streamId, input.fetcher);
    if (input.active() && command.revision > input.lastRevisionRef.current && command.facingMode) {
      input.lastRevisionRef.current = command.revision;
      await applyRemoteCamera(input.runtime, input.mediaDevices, command.facingMode);
    }
    return 0;
  } catch (error) {
    const failures = input.consecutiveFailures + 1;
    if (input.active() && failures >= 3) {
      input.runtime.setErrorMessage(error instanceof Error ? error.message : "원격 카메라 제어 연결을 확인할 수 없습니다.");
    }
    return failures;
  }
}

async function applyRemoteCamera(
  runtime: LocalWebcamPublisherRuntime,
  mediaDevices: MediaDevices,
  facingMode: CameraFacingMode,
): Promise<void> {
  const deviceId = facingMode === "front" ? FRONT_CAMERA_DEVICE_ID : REAR_CAMERA_DEVICE_ID;
  const captured = await mediaDevices.getUserMedia({ video: videoCaptureConstraints(deviceId), audio: false });
  const nextTrack = captured.getVideoTracks()[0];
  if (!nextTrack) return;
  const currentStream = runtime.streamRef.current;
  const sender = runtime.peerConnectionRef.current?.getSenders().find((candidate) => candidate.track?.kind === "video");
  await sender?.replaceTrack(nextTrack);
  currentStream?.getVideoTracks().forEach((track) => {
    currentStream.removeTrack(track);
    track.stop();
  });
  currentStream?.addTrack(nextTrack);
  runtime.setSelectedVideoDeviceId(deviceId);
  if (runtime.videoRef.current && currentStream) runtime.videoRef.current.srcObject = currentStream;
}
