export interface PublisherCaptureDevices {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

export function splitCaptureDevices(devices: MediaDeviceInfo[]): PublisherCaptureDevices {
  return {
    audioInputs: devices.filter((device) => device.kind === "audioinput"),
    videoInputs: devices.filter((device) => device.kind === "videoinput"),
  };
}
