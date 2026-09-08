import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WebRTCPlayer } from "./WebRTCPlayer";
import {
  peerConnections,
  successfulWhepResponse,
} from "./WebRTCPlayer.testHarness";
describe("WebRTCPlayer signaling", () => {
  test("starts a WHEP connection when a URL is provided", async () => {
    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" streamId="raw.sample.front" />);

    expect(screen.getByRole("status")).toHaveTextContent("loading");

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://media.example.test/raw/sample/front/whep",
        expect.objectContaining({
          method: "POST",
          body: "mock-offer-sdp",
          headers: {
            Accept: "application/sdp",
            "Content-Type": "application/sdp",
          },
        }),
      );
    });

    expect(peerConnections[0].addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
    expect(peerConnections[0].addTransceiver).toHaveBeenCalledWith("audio", { direction: "recvonly" });
    expect(RTCPeerConnection).toHaveBeenCalledWith({
      bundlePolicy: "max-bundle",
      iceCandidatePoolSize: 0,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
    });
    expect(peerConnections[0].setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "mock-answer-sdp",
    });
    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player").getAttribute("data-whep-response-ms")).toMatch(/^\d+$/);
    });
    expect(screen.getByText(/whep: \d+ms/)).toBeInTheDocument();
  });

  test("uses TURN servers returned by the backend ICE API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => [
          { urls: "stun:stun.example.test:3478" },
          {
            urls: "turn:turn.example.test:3478?transport=udp",
            username: "gcs-turn",
            credential: "test-secret",
          },
        ]),
      } as unknown as Response)
      .mockResolvedValueOnce(successfulWhepResponse as unknown as Response);

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" streamId="raw.sample.front" />);

    await waitFor(() => {
      expect(RTCPeerConnection).toHaveBeenCalledWith({
        bundlePolicy: "max-bundle",
        iceCandidatePoolSize: 0,
        iceServers: [
          { urls: "stun:stun.example.test:3478" },
          {
            urls: "turn:turn.example.test:3478?transport=udp",
            username: "gcs-turn",
            credential: "test-secret",
          },
        ],
        iceTransportPolicy: "all",
      });
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/media-control/api/v1/streams/ice-servers",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  test("renders playing state and WebRTC connection details", async () => {
    const onStatusChange = vi.fn();
    render(
      <WebRTCPlayer
        whepUrl="https://media.example.test/raw/sample/front/whep"
        streamId="raw.sample.front"
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitConnectionState("connected");
    });

    expect(screen.getByRole("status")).toHaveTextContent("playing");
    expect(screen.getByText("pc: connected")).toBeInTheDocument();
    expect(screen.getByText("ice: connected")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "playing",
        connectionState: "connected",
        iceConnectionState: "connected",
        hasVideoFrame: false,
        firstFrameLatencyMs: null,
        signalingTimings: expect.objectContaining({
          whepResponseMs: expect.any(Number),
        }),
      }),
    );
  });

  test("does not re-emit identical playback snapshots when only the parent callback changes", async () => {
    const firstStatusChange = vi.fn();
    const secondStatusChange = vi.fn();
    const { rerender } = render(
      <WebRTCPlayer
        whepUrl="https://media.example.test/raw/sample/front/whep"
        streamId="raw.sample.front"
        onStatusChange={firstStatusChange}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(firstStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          signalingTimings: expect.objectContaining({
            remoteDescriptionSetMs: expect.any(Number),
          }),
        }),
      ),
    );
    firstStatusChange.mockClear();

    rerender(
      <WebRTCPlayer
        whepUrl="https://media.example.test/raw/sample/front/whep"
        streamId="raw.sample.front"
        onStatusChange={secondStatusChange}
      />,
    );

    expect(firstStatusChange).not.toHaveBeenCalled();
    expect(secondStatusChange).not.toHaveBeenCalled();
  });

  test("records first video frame latency for browser smoke checks", async () => {
    const onStatusChange = vi.fn();
    render(
      <WebRTCPlayer
        whepUrl="https://media.example.test/raw/sample/front/whep"
        streamId="raw.sample.front"
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fireEvent.loadedData(screen.getByTestId("webrtc-video"));

    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-has-video-frame", "true");
    });
    expect(screen.getByTestId("webrtc-player").getAttribute("data-first-frame-latency-ms")).toMatch(/^\d+$/);
    expect(screen.getByText(/first frame: \d+ms/)).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasVideoFrame: true,
        firstFrameLatencyMs: expect.any(Number),
      }),
    );
  });

  test("counts gathered ICE candidate types for TURN load diagnostics", async () => {
    const onStatusChange = vi.fn();
    render(
      <WebRTCPlayer
        onStatusChange={onStatusChange}
        whepUrl="https://media.example.test/raw/sample/front/whep"
        streamId="raw.sample.front"
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitIceCandidate({
        type: "host",
        protocol: "udp",
        candidate: "candidate:1 1 udp 1 192.0.2.10 5000 typ host",
      });
      peerConnections[0].emitIceCandidate({
        type: "srflx",
        protocol: "udp",
        candidate: "candidate:2 1 udp 1 203.0.113.10 5001 typ srflx",
      });
      peerConnections[0].emitIceCandidate({
        type: "relay",
        protocol: "tcp",
        candidate: "candidate:3 1 tcp 1 203.0.113.20 5002 typ relay",
      });
    });

    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-total", "3");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-host", "1");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-srflx", "1");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-relay", "1");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-udp", "2");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-tcp", "1");
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iceCandidateStats: expect.objectContaining({
          total: 3,
          srflx: 1,
          relay: 1,
        }),
      }),
    );
  });
});
