export interface WebCodecsCapability {
  readonly supported: boolean;
  readonly videoDecoder: boolean;
  readonly videoFrame: boolean;
  readonly offscreenCanvas: boolean;
  readonly reason: "ready" | "missing-video-decoder" | "missing-video-frame";
}

export function detectWebCodecsCapability(scope: object = globalThis): WebCodecsCapability {
  const runtime = scope as Record<string, unknown>;
  const videoDecoder = typeof runtime.VideoDecoder === "function";
  const videoFrame = typeof runtime.VideoFrame === "function";
  const offscreenCanvas = typeof runtime.OffscreenCanvas === "function";

  if (!videoDecoder) {
    return {
      supported: false,
      videoDecoder,
      videoFrame,
      offscreenCanvas,
      reason: "missing-video-decoder",
    };
  }
  if (!videoFrame) {
    return {
      supported: false,
      videoDecoder,
      videoFrame,
      offscreenCanvas,
      reason: "missing-video-frame",
    };
  }
  return {
    supported: true,
    videoDecoder,
    videoFrame,
    offscreenCanvas,
    reason: "ready",
  };
}

