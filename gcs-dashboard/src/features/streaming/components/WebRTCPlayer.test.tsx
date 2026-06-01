import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WebRTCPlayer } from "./WebRTCPlayer";

class MockPeerConnection {
  addTransceiver = vi.fn();
  close = vi.fn(() => {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  });
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "mock-offer-sdp" }) as RTCSessionDescriptionInit);
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn();

  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState;
  localDescription: RTCSessionDescription | null = null;
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => unknown) | null = null;

  constructor() {
    this.iceGatheringState = initialIceGatheringState;
  }

  emitConnectionState(
    connectionState: RTCPeerConnectionState,
    iceConnectionState: RTCIceConnectionState = "connected",
  ) {
    this.connectionState = connectionState;
    this.iceConnectionState = iceConnectionState;
    this.onconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("connectionstatechange"));
  }

  emitIceConnectionState(iceConnectionState: RTCIceConnectionState) {
    this.iceConnectionState = iceConnectionState;
    this.oniceconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
  }

  emitIceGatheringComplete() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.call(this as unknown as RTCPeerConnection, new Event("icegatheringstatechange"));
  }
}

let peerConnections: MockPeerConnection[] = [];
let initialIceGatheringState: RTCIceGatheringState = "complete";

const successfulWhepResponse = {
  ok: true,
  status: 201,
  text: vi.fn(async () => "mock-answer-sdp"),
};

beforeEach(() => {
  peerConnections = [];
  initialIceGatheringState = "complete";
  vi.stubGlobal(
    "RTCPeerConnection",
    vi.fn(function MockRTCPeerConnectionConstructor() {
      const peerConnection = new MockPeerConnection();
      peerConnections.push(peerConnection);
      return peerConnection;
    }),
  );
  vi.stubGlobal("fetch", vi.fn(async () => successfulWhepResponse));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("WebRTCPlayer", () => {
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
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    expect(peerConnections[0].setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "mock-answer-sdp",
    });
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
        iceServers: [
          { urls: "stun:stun.example.test:3478" },
          {
            urls: "turn:turn.example.test:3478?transport=udp",
            username: "gcs-turn",
            credential: "test-secret",
          },
        ],
      });
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/streams/ice-servers",
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
      }),
    );
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

  test("renders offline state without creating a peer connection", () => {
    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" isOnline={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("offline");
    expect(RTCPeerConnection).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("renders an error state when WHEP signaling fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: vi.fn(),
      })),
    );

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    expect(await screen.findByText("WHEP request failed with 503")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("error");
  });

  test("waits for ICE gathering before posting the WHEP offer", async () => {
    initialIceGatheringState = "gathering";

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    await waitFor(() => expect(peerConnections[0].setLocalDescription).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalledWith(
      "https://media.example.test/raw/sample/front/whep",
      expect.objectContaining({ method: "POST" }),
    );

    act(() => {
      peerConnections[0].emitIceGatheringComplete();
    });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  test("renders an error state when the ICE connection fails", async () => {
    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitIceConnectionState("failed");
    });

    expect(screen.getByRole("status")).toHaveTextContent("error");
    expect(screen.getByText("WebRTC connection interrupted (new/failed)")).toBeInTheDocument();
    expect(screen.getByText("ice: failed")).toBeInTheDocument();
  });

  test("renders an error state when WebRTC is unavailable", async () => {
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(function UnsupportedRTCPeerConnectionConstructor() {
        throw new Error("WebRTC is not supported");
      }),
    );

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    expect(await screen.findByText("WebRTC is not supported")).toBeInTheDocument();
    expect(screen.getByText("pc: unsupported")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      "https://media.example.test/raw/sample/front/whep",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("renders an unsupported error when RTCPeerConnection is missing", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    expect(await screen.findByText("WebRTC is not supported")).toBeInTheDocument();
    expect(screen.getByText("pc: unsupported")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      "https://media.example.test/raw/sample/front/whep",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
