import { describe, expect, test } from "vitest";

import {
  getAudioModeDetail,
  getDeviceStatusDetail,
  getGpsStatusLabel,
  getPublisherSteps,
  getStatusDetail,
  getStatusLabel,
  isBusy,
} from "./publisherStatusPresentation";

describe("publisherStatusPresentation", () => {
  test("labels status and busy states for the publisher flow", () => {
    expect(getStatusLabel("sending-offer")).toBe("WHIP 전송");
    expect(getStatusDetail("connecting-media")).toContain("ICE");
    expect(isBusy("sending-offer")).toBe(true);
    expect(isBusy("published")).toBe(false);
  });

  test("builds step states from publisher status and failed step", () => {
    expect(getPublisherSteps("published", null).every((step) => step.state === "complete")).toBe(true);
    expect(getPublisherSteps("error", "signaling").map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "error",
      "pending",
    ]);
  });

  test("describes GPS, device, and audio preference states", () => {
    expect(getGpsStatusLabel("active")).toBe("수신 중");
    expect(getDeviceStatusDetail("loaded", 2, 1)).toBe("카메라 2개 / 마이크 1개 감지");
    expect(getAudioModeDetail("low-latency")).toContain("지연");
    expect(getAudioModeDetail("quality")).toContain("잡음");
  });
});
