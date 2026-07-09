import { describe, expect, test } from "vitest";

import {
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_MICROPHONE_DEVICE_ID,
  FRONT_CAMERA_DEVICE_ID,
  NO_MICROPHONE_DEVICE_ID,
  REAR_CAMERA_DEVICE_ID,
} from "./publisherContracts";
import { audioCaptureConstraints, videoCaptureConstraints } from "./publisherMediaConstraints";

describe("publisherMediaConstraints", () => {
  test("maps camera shortcut ids to browser facingMode constraints", () => {
    expect(videoCaptureConstraints(DEFAULT_CAMERA_DEVICE_ID)).toBe(true);
    expect(videoCaptureConstraints(FRONT_CAMERA_DEVICE_ID)).toEqual({ facingMode: { ideal: "user" } });
    expect(videoCaptureConstraints(REAR_CAMERA_DEVICE_ID)).toEqual({ facingMode: { ideal: "environment" } });
    expect(videoCaptureConstraints("camera-7")).toEqual({ deviceId: { exact: "camera-7" } });
  });

  test("keeps low latency audio constraints light and can disable microphone capture", () => {
    expect(audioCaptureConstraints("low-latency", NO_MICROPHONE_DEVICE_ID)).toBe(false);
    expect(audioCaptureConstraints("low-latency", DEFAULT_MICROPHONE_DEVICE_ID)).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleRate: 48_000,
    });
    expect(audioCaptureConstraints("quality", "mic-1")).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: { exact: "mic-1" },
    });
  });
});
