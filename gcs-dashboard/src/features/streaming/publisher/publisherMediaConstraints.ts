import {
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_MICROPHONE_DEVICE_ID,
  FRONT_CAMERA_DEVICE_ID,
  NO_MICROPHONE_DEVICE_ID,
  REAR_CAMERA_DEVICE_ID,
  type AudioCaptureMode,
} from "./publisherContracts";

export function videoCaptureConstraints(selectedDeviceId: string): boolean | MediaTrackConstraints {
  if (selectedDeviceId === FRONT_CAMERA_DEVICE_ID) {
    return { facingMode: { ideal: "user" } };
  }
  if (selectedDeviceId === REAR_CAMERA_DEVICE_ID) {
    return { facingMode: { ideal: "environment" } };
  }
  if (selectedDeviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    return { deviceId: { exact: selectedDeviceId } };
  }
  return true;
}

export function audioCaptureConstraints(
  mode: AudioCaptureMode,
  selectedDeviceId = DEFAULT_MICROPHONE_DEVICE_ID,
): boolean | MediaTrackConstraints {
  if (selectedDeviceId === NO_MICROPHONE_DEVICE_ID) {
    return false;
  }
  const constraints: MediaTrackConstraints = {
    echoCancellation: mode === "quality",
    noiseSuppression: mode === "quality",
    autoGainControl: mode === "quality",
    channelCount: 1,
    sampleRate: 48_000,
  };
  if (selectedDeviceId !== DEFAULT_MICROPHONE_DEVICE_ID) {
    constraints.deviceId = { exact: selectedDeviceId };
  }
  return constraints;
}
