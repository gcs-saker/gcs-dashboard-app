import { describe, expect, test } from "vitest";

import {
  createWebCodecsPipelinePlan,
  WEB_CODECS_PIPELINE_MODES,
  WEB_CODECS_PIPELINE_STAGES,
} from "./webCodecsPipelinePlan";

describe("webCodecsPipelinePlan", () => {
  test("keeps normal playback on video element path when frame access is not needed", () => {
    const plan = createWebCodecsPipelinePlan({
      mode: WEB_CODECS_PIPELINE_MODES.HLS_FALLBACK,
      capability: {
        supported: true,
        videoDecoder: true,
        videoFrame: true,
        offscreenCanvas: true,
        reason: "ready",
      },
      needsFrameAccess: false,
    });

    expect(plan).toEqual({
      mode: "hls-fallback",
      stage: WEB_CODECS_PIPELINE_STAGES.VIDEO_ELEMENT_ONLY,
      reason: "frame-access-not-needed",
    });
  });

  test("uses canvas-only fallback when WebCodecs frame APIs are missing", () => {
    const plan = createWebCodecsPipelinePlan({
      mode: WEB_CODECS_PIPELINE_MODES.AI_OVERLAY,
      capability: {
        supported: false,
        videoDecoder: false,
        videoFrame: true,
        offscreenCanvas: true,
        reason: "missing-video-decoder",
      },
      needsFrameAccess: true,
    });

    expect(plan.stage).toBe(WEB_CODECS_PIPELINE_STAGES.CANVAS_OVERLAY_ONLY);
    expect(plan.reason).toBe("missing-video-decoder");
  });

  test("does not start worker pipeline without OffscreenCanvas", () => {
    const plan = createWebCodecsPipelinePlan({
      mode: WEB_CODECS_PIPELINE_MODES.RECORDING,
      capability: {
        supported: true,
        videoDecoder: true,
        videoFrame: true,
        offscreenCanvas: false,
        reason: "ready",
      },
      needsFrameAccess: true,
    });

    expect(plan.stage).toBe(WEB_CODECS_PIPELINE_STAGES.CANVAS_OVERLAY_ONLY);
    expect(plan.reason).toBe("missing-worker-canvas");
  });

  test("selects worker pipeline only when decoder frame and worker canvas are ready", () => {
    const plan = createWebCodecsPipelinePlan({
      mode: WEB_CODECS_PIPELINE_MODES.AI_OVERLAY,
      capability: {
        supported: true,
        videoDecoder: true,
        videoFrame: true,
        offscreenCanvas: true,
        reason: "ready",
      },
      needsFrameAccess: true,
    });

    expect(plan).toEqual({
      mode: "ai-overlay",
      stage: WEB_CODECS_PIPELINE_STAGES.WEBCODECS_WORKER,
      reason: "webcodecs-ready",
    });
  });
});
