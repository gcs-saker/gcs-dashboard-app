import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { HLSFallbackPlayerProps, WebRTCPlayerProps } from "../types";
import { RealtimePlayer } from "./RealtimePlayer";

vi.mock("./WebRTCPlayer", () => ({
  WebRTCPlayer: function MockWebRTCPlayer({ whepUrl, streamId, onStatusChange }: WebRTCPlayerProps) {
    return (
      <div data-testid="webrtc-player">
        <span>webrtc:{whepUrl}</span>
        <span>stream:{streamId}</span>
        <button
          type="button"
          onClick={() =>
            onStatusChange?.({
              status: "playing",
              connectionState: "connected",
              iceConnectionState: "connected",
              errorMessage: null,
            })
          }
        >
          webrtc playing
        </button>
        <button
          type="button"
          onClick={() =>
            onStatusChange?.({
              status: "error",
              connectionState: "failed",
              iceConnectionState: "failed",
              errorMessage: "WebRTC connection failed",
            })
          }
        >
          webrtc failed
        </button>
      </div>
    );
  },
}));

vi.mock("./HLSFallbackPlayer", () => ({
  HLSFallbackPlayer: function MockHLSFallbackPlayer({
    hlsUrl,
    streamId,
    fallbackReason,
  }: HLSFallbackPlayerProps) {
    return (
      <div data-testid="hls-fallback-player">
        <span>hls:{hlsUrl}</span>
        <span>stream:{streamId}</span>
        <span>reason:{fallbackReason}</span>
      </div>
    );
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RealtimePlayer", () => {
  test("loads playback API data and renders WebRTC primary playback", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        streamId: "raw.sample.front",
        status: "online",
        playbackUrls: {
          webrtc: "https://media.example.test/raw/sample/front/whep",
          hls: "https://media.example.test/raw/sample/front/index.m3u8",
        },
      }),
    );

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);

    expect(screen.getByRole("status")).toHaveTextContent("loading playback");
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/streams/raw.sample.front/playback",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
    expect(screen.getByText("webrtc:https://media.example.test/raw/sample/front/whep")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
  });

  test("switches from WebRTC to HLS fallback when WebRTC fails", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        streamId: "raw.sample.front",
        status: "online",
        playbackUrls: {
          webrtc: "https://media.example.test/raw/sample/front/whep",
          hls: "https://media.example.test/raw/sample/front/index.m3u8",
        },
      }),
    );

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "webrtc failed" }));

    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.getByTestId("hls-fallback-player")).toBeInTheDocument();
    expect(screen.getByText("hls:https://media.example.test/raw/sample/front/index.m3u8")).toBeInTheDocument();
    expect(screen.getByText("reason:WebRTC connection failed")).toBeInTheDocument();
  });

  test("renders HLS fallback immediately when WebRTC URL is unavailable", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        streamId: "raw.sample.front",
        status: "online",
        playbackUrls: {
          webrtc: null,
          hls: "https://media.example.test/raw/sample/front/index.m3u8",
        },
      }),
    );

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);

    await waitFor(() => expect(screen.getByTestId("hls-fallback-player")).toBeInTheDocument());
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.getByText("reason:WebRTC URL is unavailable. Playing HLS fallback.")).toBeInTheDocument();
  });

  test("renders offline state when the stream is offline", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        streamId: "raw.sample.thermal",
        status: "offline",
        playbackUrls: {
          webrtc: "https://media.example.test/raw/sample/thermal/whep",
          hls: "https://media.example.test/raw/sample/thermal/index.m3u8",
        },
      }),
    );

    render(<RealtimePlayer streamId="raw.sample.thermal" fetcher={fetcher} />);

    expect(await screen.findByText("stream offline")).toBeInTheDocument();
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
  });

  test("renders API error state", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: "missing" }, 404));

    render(<RealtimePlayer streamId="raw.missing.front" fetcher={fetcher} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Playback API request failed with 404");
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
