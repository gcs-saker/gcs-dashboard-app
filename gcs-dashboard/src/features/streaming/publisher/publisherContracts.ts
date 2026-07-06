export type WebcamPublisherStatus =
  | "idle"
  | "requesting-camera"
  | "previewing"
  | "creating-offer"
  | "gathering-ice"
  | "sending-offer"
  | "signaling-complete"
  | "connecting-media"
  | "published"
  | "reconnecting"
  | "error"
  | "unsupported";

export type PublisherStepId = "camera" | "ice" | "signaling" | "media";
export type PublisherStepState = "pending" | "active" | "complete" | "error";
export type PublisherGpsStatus = "idle" | "requesting" | "active" | "unavailable" | "error";
export type PublisherDeviceStatus = "idle" | "loading" | "loaded" | "unavailable" | "error";
export type AudioCaptureMode = "low-latency" | "quality";

export interface PublisherStreamTarget {
  id: string;
  label: string;
  whipPath: string;
}

export const ICE_GATHERING_TIMEOUT_MS = 5_000;
export const MEDIA_CONNECTION_TIMEOUT_MS = 8_000;
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000] as const;
export const DEFAULT_CAMERA_DEVICE_ID = "__default_camera__";
export const FRONT_CAMERA_DEVICE_ID = "__front_camera__";
export const REAR_CAMERA_DEVICE_ID = "__rear_camera__";
export const DEFAULT_MICROPHONE_DEVICE_ID = "__default_microphone__";
export const NO_MICROPHONE_DEVICE_ID = "__no_microphone__";
