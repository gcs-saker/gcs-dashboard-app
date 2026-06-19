import type { WebCodecsCapability } from "./webCodecsSupport";

export const WEB_CODECS_PIPELINE_MODES = {
  HLS_FALLBACK: "hls-fallback",
  RECORDING: "recording",
  AI_OVERLAY: "ai-overlay",
} as const;

export type WebCodecsPipelineMode =
  (typeof WEB_CODECS_PIPELINE_MODES)[keyof typeof WEB_CODECS_PIPELINE_MODES];

export const WEB_CODECS_PIPELINE_STAGES = {
  VIDEO_ELEMENT_ONLY: "video-element-only",
  CANVAS_OVERLAY_ONLY: "canvas-overlay-only",
  WEBCODECS_WORKER: "webcodecs-worker",
} as const;

export type WebCodecsPipelineStage =
  (typeof WEB_CODECS_PIPELINE_STAGES)[keyof typeof WEB_CODECS_PIPELINE_STAGES];

export interface WebCodecsPipelineRequest {
  readonly mode: WebCodecsPipelineMode;
  readonly capability: WebCodecsCapability;
  readonly needsFrameAccess: boolean;
}

export interface WebCodecsPipelinePlan {
  readonly mode: WebCodecsPipelineMode;
  readonly stage: WebCodecsPipelineStage;
  readonly reason:
    | "frame-access-not-needed"
    | "webcodecs-ready"
    | "missing-worker-canvas"
    | WebCodecsCapability["reason"];
}

export function createWebCodecsPipelinePlan(request: WebCodecsPipelineRequest): WebCodecsPipelinePlan {
  if (!request.needsFrameAccess) {
    return {
      mode: request.mode,
      stage: WEB_CODECS_PIPELINE_STAGES.VIDEO_ELEMENT_ONLY,
      reason: "frame-access-not-needed",
    };
  }

  if (!request.capability.supported) {
    return {
      mode: request.mode,
      stage: WEB_CODECS_PIPELINE_STAGES.CANVAS_OVERLAY_ONLY,
      reason: request.capability.reason,
    };
  }

  if (!request.capability.offscreenCanvas) {
    return {
      mode: request.mode,
      stage: WEB_CODECS_PIPELINE_STAGES.CANVAS_OVERLAY_ONLY,
      reason: "missing-worker-canvas",
    };
  }

  return {
    mode: request.mode,
    stage: WEB_CODECS_PIPELINE_STAGES.WEBCODECS_WORKER,
    reason: "webcodecs-ready",
  };
}
