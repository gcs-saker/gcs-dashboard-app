import { describe, expect, it } from "vitest";
import { splitCaptureDevices } from "./publisherDeviceCatalog";

describe("publisherDeviceCatalog", () => {
  it("separates camera and microphone inputs from browser device catalog", () => {
    const devices = [
      { deviceId: "cam-1", kind: "videoinput", label: "Front camera" },
      { deviceId: "mic-1", kind: "audioinput", label: "Built-in mic" },
      { deviceId: "speaker-1", kind: "audiooutput", label: "Speaker" },
      { deviceId: "cam-2", kind: "videoinput", label: "Back camera" },
    ] as MediaDeviceInfo[];

    expect(splitCaptureDevices(devices)).toEqual({
      audioInputs: [devices[1]],
      videoInputs: [devices[0], devices[3]],
    });
  });
});
