import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { HLSFallbackPlayerProps, WebRTCPlayerProps } from "../types";
import { normalizeBrowserMediaUrl } from "../hooks/useRealtimePlayback";
import { RealtimePlayer } from "./RealtimePlayer";

const emptyAudioStats = {
  audioLevel: null,
  jitterMs: null,
  jitterBufferDelayMs: null,
  packetsLost: null,
  packetsReceived: null,
  concealedSamples: null,
  roundTripTimeMs: null,
  localCandidateType: null,
  remoteCandidateType: null,
  transportProtocol: null,
  relayFallbackReason: null,
};

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
              hasVideoFrame: true,
              hasAudioTrack: true,
              isAudioActive: true,
              firstFrameLatencyMs: 812,
              signalingTimings: {
                iceServersLoadedMs: 10,
                offerCreatedMs: 20,
                localDescriptionSetMs: 30,
                iceGatheringDoneMs: 40,
                whepResponseMs: 120,
                remoteDescriptionSetMs: 130,
              },
              audioStats: {
                ...emptyAudioStats,
                audioLevel: 0.58,
                jitterMs: 24,
                packetsLost: 1,
              },
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
              hasVideoFrame: false,
              hasAudioTrack: false,
              isAudioActive: false,
              firstFrameLatencyMs: null,
              signalingTimings: {
                iceServersLoadedMs: 10,
                offerCreatedMs: 20,
                localDescriptionSetMs: 30,
                iceGatheringDoneMs: 40,
                whepResponseMs: 503,
                remoteDescriptionSetMs: null,
              },
              audioStats: emptyAudioStats,
            })
          }
        >
          webrtc failed
        </button>
        <button
          type="button"
          onClick={() =>
            onStatusChange?.({
              status: "error",
              connectionState: "failed",
              iceConnectionState: "failed",
              errorMessage: "WebRTC relay candidate failed",
              hasVideoFrame: false,
              hasAudioTrack: true,
              isAudioActive: false,
              firstFrameLatencyMs: null,
              signalingTimings: {
                iceServersLoadedMs: 10,
                offerCreatedMs: 20,
                localDescriptionSetMs: 30,
                iceGatheringDoneMs: 40,
                whepResponseMs: 503,
                remoteDescriptionSetMs: null,
              },
              audioStats: {
                ...emptyAudioStats,
                localCandidateType: "relay",
                relayFallbackReason: "local-direct-candidate-failed",
              },
            })
          }
        >
          relay failed
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
  vi.useRealTimers();
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

    expect(screen.getByRole("status")).toHaveTextContent("스트림 신호 확인 중");
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

  test("normalizes deployed media URLs away from localhost and insecure same-host http", () => {
    expect(
      normalizeBrowserMediaUrl(
        "http://localhost:8080/webrtc/raw/local/webcam/whep",
        "https://gcs.example.test/",
      ),
    ).toBe("https://gcs.example.test/webrtc/raw/local/webcam/whep");
    expect(
      normalizeBrowserMediaUrl(
        "http://gcs.example.test/webrtc/raw/local/webcam/whep",
        "https://gcs.example.test/",
      ),
    ).toBe("https://gcs.example.test/webrtc/raw/local/webcam/whep");
  });

  test("retries WebRTC with bounded backoff before HLS fallback", async () => {
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

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} reconnectDelaysMs={[25]} />);
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "webrtc failed" }));

    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("스트림 재연결 중25ms 후 다시 시도합니다.");

    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "webrtc failed" }));

    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.getByTestId("hls-fallback-player")).toBeInTheDocument();
    expect(screen.getByText("hls:https://media.example.test/raw/sample/front/index.m3u8")).toBeInTheDocument();
    expect(screen.getByText("reason:WebRTC connection failed")).toBeInTheDocument();
  });

  test("falls back immediately after relay candidate failure to avoid repeated TURN allocation", async () => {
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

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} reconnectDelaysMs={[25, 50]} />);
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "relay failed" }));

    expect(screen.queryByText(/스트림 재연결 중/)).not.toBeInTheDocument();
    expect(screen.getByTestId("hls-fallback-player")).toBeInTheDocument();
    expect(screen.getByText("reason:WebRTC relay candidate failed")).toBeInTheDocument();
  });

  test("renders a clear error when WebRTC fails and no HLS fallback exists", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        streamId: "raw.sample.front",
        status: "online",
        playbackUrls: {
          webrtc: "https://media.example.test/raw/sample/front/whep",
          hls: null,
        },
      }),
    );

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "webrtc failed" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("수신 경로 오류");
    expect(alert).toHaveTextContent("실시간 재생 경로를 열 수 없습니다.");
    expect(alert).not.toHaveTextContent("WebRTC connection failed");
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
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

    expect(await screen.findByText("송출 신호 없음")).toBeInTheDocument();
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
  });

  test("renders API error state", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: "invalid stream id" }, 422));

    render(<RealtimePlayer streamId="raw.missing.front" fetcher={fetcher} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("수신 경로 오류");
    expect(alert).toHaveTextContent("주소 변경 또는 인증 서버 상태를 확인하세요.");
    expect(alert).not.toHaveTextContent("Playback API request failed with 422");
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
  });

  test("polls playback readiness before surfacing a temporary missing stream error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "stream is not ready" }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          streamId: "raw.sample.front",
          status: "online",
          playbackUrls: {
            webrtc: "https://media.example.test/raw/sample/front/whep",
            hls: "https://media.example.test/raw/sample/front/index.m3u8",
          },
        }),
      );

    render(
      <RealtimePlayer
        streamId="raw.sample.front"
        fetcher={fetcher}
        playbackReadyRetryDelaysMs={[1]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("스트림 신호 확인 중");
    await waitFor(() => expect(screen.getByTestId("webrtc-player")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("contains malformed playback payloads inside the realtime player", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ access_token: "unexpected-auth-payload" }));

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("수신 경로 오류");
    expect(alert).not.toHaveTextContent("Playback API response is invalid");
    expect(screen.getByText("mode: error")).toBeInTheDocument();
    expect(screen.queryByTestId("webrtc-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hls-fallback-player")).not.toBeInTheDocument();
  });

  test("contains backend fetch failures inside the realtime player", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });

    render(<RealtimePlayer streamId="raw.sample.front" fetcher={fetcher} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("수신 경로 오류");
    expect(alert).not.toHaveTextContent("Failed to fetch");
    expect(screen.getByText("mode: error")).toBeInTheDocument();
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
