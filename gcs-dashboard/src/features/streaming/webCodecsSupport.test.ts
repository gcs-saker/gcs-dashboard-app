import { describe, expect, test } from "vitest";

import { detectWebCodecsCapability } from "./webCodecsSupport";

describe("webCodecsSupport", () => {
  test("reports ready when VideoDecoder and VideoFrame are available", () => {
    const capability = detectWebCodecsCapability({
      VideoDecoder: function VideoDecoder() {},
      VideoFrame: function VideoFrame() {},
      OffscreenCanvas: function OffscreenCanvas() {},
    });

    expect(capability).toEqual({
      supported: true,
      videoDecoder: true,
      videoFrame: true,
      offscreenCanvas: true,
      reason: "ready",
    });
  });

  test("reports fallback reason when decoder is unavailable", () => {
    const capability = detectWebCodecsCapability({
      VideoFrame: function VideoFrame() {},
    });

    expect(capability.supported).toBe(false);
    expect(capability.reason).toBe("missing-video-decoder");
  });

  test("reports fallback reason when frame API is unavailable", () => {
    const capability = detectWebCodecsCapability({
      VideoDecoder: function VideoDecoder() {},
    });

    expect(capability.supported).toBe(false);
    expect(capability.reason).toBe("missing-video-frame");
  });
});

