import { describe, expect, it } from "vitest";

import { normalizeStreamAddress } from "./streamAddress";

describe("streamAddress", () => {
  it("normalizes WebRTC and HLS edge paths into stream ids", () => {
    expect(normalizeStreamAddress("raw.local.webcam")).toBe("raw.local.webcam");
    expect(normalizeStreamAddress("/webrtc/raw/local/webcam/whep")).toBe("raw.local.webcam");
    expect(normalizeStreamAddress("https://a4ai.tplinkdns.com/hls/raw/local/webcam/index.m3u8")).toBe("raw.local.webcam");
  });

  it("rejects unsupported stream address shapes", () => {
    expect(() => normalizeStreamAddress("")).toThrow("스트림 주소를 입력해야 합니다.");
    expect(() => normalizeStreamAddress("local-webcam")).toThrow("스트림 주소는 raw/asset/sensor");
  });
});
