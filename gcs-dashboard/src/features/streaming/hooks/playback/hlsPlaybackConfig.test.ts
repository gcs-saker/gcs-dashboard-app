import { describe, expect, test, vi } from "vitest";

import { appendHlsPlaybackQuery, hlsConfigForLatencyMode } from "@streaming/hooks/playback/hlsPlaybackConfig";

describe("hlsPlaybackConfig", () => {
  test("builds low-latency hls.js settings for realtime fallback", () => {
    expect(hlsConfigForLatencyMode("low-latency", "https://media.example.test/index.m3u8")).toMatchObject({
      lowLatencyMode: true,
      backBufferLength: 10,
      liveSyncDurationCount: 2,
      maxLiveSyncPlaybackRate: 1.5,
      capLevelToPlayerSize: true,
      xhrSetup: expect.any(Function),
    });
  });

  test("builds stable hls.js settings by default for fewer stalls", () => {
    expect(hlsConfigForLatencyMode("stable", "https://media.example.test/index.m3u8")).toMatchObject({
      lowLatencyMode: false,
      backBufferLength: 30,
      liveSyncDurationCount: 4,
      maxLiveSyncPlaybackRate: 1.2,
      capLevelToPlayerSize: true,
      xhrSetup: expect.any(Function),
    });
  });

  test("preserves playback token on relative segment requests", () => {
    const source = "https://media.example.test/hls/raw/sample/front/index.m3u8?playbackToken=issued-token";

    expect(appendHlsPlaybackQuery("segment-1.ts", source)).toBe(
      "https://media.example.test/hls/raw/sample/front/segment-1.ts?playbackToken=issued-token",
    );
  });

  test("does not duplicate an existing playback token", () => {
    const source = "https://media.example.test/hls/raw/sample/front/index.m3u8?playbackToken=issued-token";

    expect(
      appendHlsPlaybackQuery("https://media.example.test/hls/raw/sample/front/segment-2.ts?playbackToken=existing", source),
    ).toBe("https://media.example.test/hls/raw/sample/front/segment-2.ts?playbackToken=existing");
  });

  test("keeps the original URL when source token or URL parsing is unavailable", () => {
    expect(appendHlsPlaybackQuery("segment-3.ts", "https://media.example.test/hls/raw/sample/front/index.m3u8")).toBe(
      "segment-3.ts",
    );
    expect(appendHlsPlaybackQuery("segment-4.ts", "http://[broken")).toBe("segment-4.ts");
  });

  test("xhrSetup reopens playlist or segment requests with propagated playback token", () => {
    const source = "https://media.example.test/hls/raw/sample/front/index.m3u8?playbackToken=issued-token";
    const config = hlsConfigForLatencyMode("stable", source);
    const xhr = { open: vi.fn() };

    (config.xhrSetup as (xhr: XMLHttpRequest, url: string) => void)(xhr as unknown as XMLHttpRequest, "segment-5.ts");

    expect(xhr.open).toHaveBeenCalledWith(
      "GET",
      "https://media.example.test/hls/raw/sample/front/segment-5.ts?playbackToken=issued-token",
      true,
    );
  });
});
