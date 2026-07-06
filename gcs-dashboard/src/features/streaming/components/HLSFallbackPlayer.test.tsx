import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { appendHlsPlaybackQuery } from "@streaming/hooks/hlsPlaybackConfig";
import { HLSFallbackPlayer } from "./HLSFallbackPlayer";

const hlsMock = vi.hoisted(() => {
  const instances: MockHls[] = [];

  class MockHls {
    static Events = {
      ERROR: "hlsError",
      MANIFEST_PARSED: "manifestParsed",
    };

    static isSupported = vi.fn(() => true);

    handlers: Record<string, Array<() => void>> = {};
    attachMedia = vi.fn();
    destroy = vi.fn();
    loadSource = vi.fn();

    constructor(public config: Record<string, unknown> = {}) {
      instances.push(this);
    }

    on(eventName: string, handler: () => void) {
      this.handlers[eventName] = [...(this.handlers[eventName] ?? []), handler];
    }

    emit(eventName: string) {
      for (const handler of this.handlers[eventName] ?? []) {
        handler();
      }
    }
  }

  return { MockHls, instances };
});

vi.mock("hls.js/light", () => ({ default: hlsMock.MockHls }));

const hlsUrl = "https://media.example.test/raw/sample/front/index.m3u8";

beforeEach(() => {
  hlsMock.instances.length = 0;
  hlsMock.MockHls.isSupported.mockClear();
  hlsMock.MockHls.isSupported.mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HLSFallbackPlayer", () => {
  test("renders fallback player and starts hls.js playback when an HLS URL is provided", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} streamId="raw.sample.front" latencyMode="low-latency" />);

    expect(screen.getByText("WebRTC failed. Playing HLS fallback.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("fallback loading"));
    expect(hlsMock.instances[0].config).toMatchObject({
      lowLatencyMode: true,
      backBufferLength: 10,
      liveSyncDurationCount: 2,
      maxLiveSyncPlaybackRate: 1.5,
      capLevelToPlayerSize: true,
    });
    expect(hlsMock.instances[0].config.xhrSetup).toEqual(expect.any(Function));
    expect(hlsMock.instances[0].loadSource).toHaveBeenCalledWith(hlsUrl);
    expect(hlsMock.instances[0].attachMedia).toHaveBeenCalledWith(screen.getByLabelText("HLS fallback stream"));
    expect(screen.getByLabelText("HLS fallback stream")).toHaveAttribute("preload", "none");

    act(() => {
      hlsMock.instances[0].emit("manifestParsed");
    });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("fallback playing"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByText("mode: hlsjs")).toBeInTheDocument();
    expect(screen.getByText("저지연 HLS")).toBeInTheDocument();
    expect(screen.getByText("WebCodecs: fallback")).toBeInTheDocument();
  });

  test("reports WebCodecs capability in status snapshots", async () => {
    vi.stubGlobal("VideoDecoder", function VideoDecoder() {});
    vi.stubGlobal("VideoFrame", function VideoFrame() {});
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    const onStatusChange = vi.fn();

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} onStatusChange={onStatusChange} />);

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webCodecs: {
          supported: true,
          reason: "ready",
        },
      }),
    );
  });

  test("uses stable HLS fallback mode by default to reduce playback stalls", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} streamId="raw.sample.front" />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("fallback loading"));
    expect(hlsMock.instances[0].config).toMatchObject({
      lowLatencyMode: false,
      backBufferLength: 30,
      liveSyncDurationCount: 4,
      maxLiveSyncPlaybackRate: 1.2,
      capLevelToPlayerSize: true,
    });
    expect(screen.getByText("안정 HLS")).toBeInTheDocument();
  });

  test("preserves playback token on hls.js playlist and segment requests", () => {
    const source = "https://media.example.test/hls/raw/sample/front/index.m3u8?playbackToken=issued-token";

    expect(appendHlsPlaybackQuery("segment-1.ts", source)).toBe(
      "https://media.example.test/hls/raw/sample/front/segment-1.ts?playbackToken=issued-token",
    );
    expect(appendHlsPlaybackQuery("https://media.example.test/hls/raw/sample/front/segment-2.ts?playbackToken=existing", source)).toBe(
      "https://media.example.test/hls/raw/sample/front/segment-2.ts?playbackToken=existing",
    );
    expect(appendHlsPlaybackQuery("segment-3.ts", "https://media.example.test/hls/raw/sample/front/index.m3u8")).toBe(
      "segment-3.ts",
    );
  });

  test("renders a clear fallback reason after WebRTC failure", () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(
      <HLSFallbackPlayer
        hlsUrl={hlsUrl}
        fallbackReason="WebRTC connection failed. HLS fallback is active."
      />,
    );

    expect(screen.getByText("WebRTC connection failed. HLS fallback is active.")).toBeInTheDocument();
  });

  test("uses native HLS when hls.js is not supported", async () => {
    hlsMock.MockHls.isSupported.mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} />);
    const video = screen.getByLabelText("HLS fallback stream") as HTMLVideoElement;

    expect(video.src).toBe(hlsUrl);
    expect(screen.getByText("mode: native")).toBeInTheDocument();

    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("fallback playing"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(hlsMock.instances).toHaveLength(0);
  });

  test("renders unsupported error when neither hls.js nor native HLS is available", () => {
    hlsMock.MockHls.isSupported.mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} />);

    return waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("fallback error");
      expect(screen.getByText("HLS playback is not supported in this browser")).toBeInTheDocument();
      expect(screen.getByText("mode: unsupported")).toBeInTheDocument();
    });
  });

  test("renders a playback error when hls.js setup fails", () => {
    hlsMock.MockHls.isSupported.mockImplementation(() => {
      throw new Error("hls setup failed");
    });
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} />);

    return waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("fallback error");
      expect(screen.getByText("HLS playback failed")).toBeInTheDocument();
    });
  });

  test("renders an error when the HLS URL is missing", () => {
    render(<HLSFallbackPlayer hlsUrl={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("fallback error");
    expect(screen.getByText("HLS URL is required")).toBeInTheDocument();
    expect(hlsMock.MockHls.isSupported).not.toHaveBeenCalled();
  });

  test("renders an error when hls.js emits a playback error", () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    render(<HLSFallbackPlayer hlsUrl={hlsUrl} />);

    return waitFor(() => expect(hlsMock.instances[0]).toBeDefined()).then(() => {
      act(() => {
        hlsMock.instances[0].emit("hlsError");
      });

      expect(screen.getByRole("status")).toHaveTextContent("fallback error");
      expect(screen.getByText("HLS playback failed")).toBeInTheDocument();
    });
  });

  test("cleans up hls.js when the player unmounts", () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");

    const { unmount } = render(<HLSFallbackPlayer hlsUrl={hlsUrl} />);

    return waitFor(() => expect(hlsMock.instances[0]).toBeDefined()).then(() => {
      const hls = hlsMock.instances[0];

      unmount();

      expect(hls.destroy).toHaveBeenCalled();
    });
  });
});
