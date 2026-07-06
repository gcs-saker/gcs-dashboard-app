import { describe, expect, test } from "vitest";

import { buildWhipUrl, DEFAULT_STREAM_TARGETS, ensureStreamTargets } from "./publisherTargets";

describe("publisherTargets", () => {
  test("keeps default targets when the configured stream is already present", () => {
    expect(ensureStreamTargets(DEFAULT_STREAM_TARGETS, DEFAULT_STREAM_TARGETS[0].id, "/webrtc/raw/local/webcam/whip"))
      .toEqual(DEFAULT_STREAM_TARGETS);
  });

  test("adds an explicit target and infers the WHIP path from the URL", () => {
    expect(ensureStreamTargets(DEFAULT_STREAM_TARGETS, "raw.custom.front", "/webrtc/raw/custom/front/whip")[0]).toEqual({
      id: "raw.custom.front",
      label: "현재 설정",
      whipPath: "raw/custom/front",
    });
  });

  test("rewrites the media path while preserving the WHEP/WHIP base route", () => {
    expect(buildWhipUrl("https://edge.example/webrtc/raw/local/webcam/whip", "raw/local/rear"))
      .toBe("https://edge.example/webrtc/raw/local/rear/whip");
    expect(buildWhipUrl("https://edge.example/custom/path/whip", "raw/local/rear"))
      .toBe("https://edge.example/raw/local/rear/whip");
  });
});
