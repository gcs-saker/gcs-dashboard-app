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
  getStats = vi.fn(async () => this.statsReport as unknown as RTCStatsReport);
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn();

  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState;
  localDescription: RTCSessionDescription | null = null;
  statsReport = new Map<string, Record<string, unknown>>();
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown) | null = null;
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

  emitIceCandidate(candidate: Partial<RTCIceCandidate>) {
    this.onicecandidate?.call(this as unknown as RTCPeerConnection, {
      candidate,
    } as RTCPeerConnectionIceEvent);
  }

  emitIceGatheringComplete() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.call(this as unknown as RTCPeerConnection, new Event("icegatheringstatechange"));
  }

  emitRemoteTrack(streams: MediaStream[]) {
    this.ontrack?.call(this as unknown as RTCPeerConnection, {
      streams,
      track: { id: "video-track-1" },
    } as unknown as RTCTrackEvent);
  }

  setStats(stats: Array<Record<string, unknown>>) {
    this.statsReport = new Map(stats.map((stat) => [String(stat.id), stat]));
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
  vi.stubGlobal(
    "MediaStream",
    vi.fn(function MockMediaStream() {
      return {
        addTrack: vi.fn(),
      };
    }),
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.useRealTimers();
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

  test("attaches remote WHEP tracks even when the track event has no stream", async () => {
    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitRemoteTrack([]);
    });

    const video = screen.getByTestId("webrtc-video") as HTMLVideoElement;
    expect(MediaStream).toHaveBeenCalled();
    expect(video.srcObject).toBeTruthy();
  });

  test("reports audio activity when the remote stream includes a live audio track", async () => {
    const onStatusChange = vi.fn();
    const audioTrack = {
      enabled: true,
      muted: false,
      readyState: "live",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const remoteStream = {
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    render(
      <WebRTCPlayer
        onStatusChange={onStatusChange}
        whepUrl="https://media.example.test/raw/sample/front/whep"
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitRemoteTrack([remoteStream]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-active", "true");
    });
    expect(screen.getByText("audio")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasAudioTrack: true,
        isAudioActive: true,
      }),
    );
  });

  test("reports a real audio level from the remote MediaStream analyser when RTC stats are empty", async () => {
    const onStatusChange = vi.fn();
    const animationFrameCallbacks = new Map<number, FrameRequestCallback>();
    let animationFrameId = 0;
    const waveformSamples = new Uint8Array(256).fill(144);
    const analyserNode = {
      fftSize: 256,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteTimeDomainData: vi.fn((samples: Uint8Array) => {
        samples.set(waveformSamples);
      }),
    };
    const sourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const audioContext = {
      close: vi.fn(async () => undefined),
      createAnalyser: vi.fn(() => analyserNode),
      createMediaStreamSource: vi.fn(() => sourceNode),
      resume: vi.fn(async () => undefined),
    };
    const audioTrack = {
      enabled: true,
      muted: false,
      readyState: "live",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const remoteStream = {
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    vi.stubGlobal(
      "AudioContext",
      vi.fn(function MockAudioContext() {
        return audioContext;
      }),
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameId += 1;
        animationFrameCallbacks.set(animationFrameId, callback);
        return animationFrameId;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => animationFrameCallbacks.delete(id)));

    render(
      <WebRTCPlayer
        onStatusChange={onStatusChange}
        whepUrl="https://media.example.test/raw/sample/front/whep"
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitRemoteTrack([remoteStream]);
    });
    act(() => {
      animationFrameCallbacks.get(1)?.(200);
    });

    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-level", "0.5");
    });
    expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(remoteStream);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audioStats: expect.objectContaining({ audioLevel: 0.5 }),
      }),
    );
  });

  test("reports inbound audio jitter, packet loss, and ICE candidate type", async () => {
    const onStatusChange = vi.fn();
    const remoteStream = {
      getAudioTracks: () => [
        {
          enabled: true,
          muted: false,
          readyState: "live",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      ],
    } as unknown as MediaStream;

    render(
      <WebRTCPlayer
        onStatusChange={onStatusChange}
        whepUrl="https://media.example.test/raw/sample/front/whep"
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].setStats([
        {
          id: "audio-inbound",
          type: "inbound-rtp",
          kind: "audio",
          audioLevel: 0.42,
          jitter: 0.034,
          jitterBufferDelay: 1.2,
          jitterBufferEmittedCount: 6,
          packetsLost: 3,
          packetsReceived: 180,
          concealedSamples: 960,
        },
        {
          id: "pair-1",
          type: "candidate-pair",
          selected: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
          currentRoundTripTime: 0.12,
        },
        { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp" },
        { id: "remote-1", type: "remote-candidate", candidateType: "host", protocol: "udp" },
      ]);
      peerConnections[0].emitRemoteTrack([remoteStream]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-jitter-ms", "34");
    }, { timeout: 2_500 });
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-level", "0.42");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-jitter-buffer-delay-ms", "200");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-packets-lost", "3");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-packets-received", "180");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-round-trip-time-ms", "120");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-candidate-type", "relay");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-remote-ice-candidate-type", "host");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-ice-transport", "udp");
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute(
      "data-relay-fallback-reason",
      "local-nat-or-firewall-fallback",
    );
    await waitFor(() => {
      expect(
        onStatusChange.mock.calls.some(([snapshot]) =>
          snapshot.audioStats.audioLevel === 0.42 &&
          snapshot.audioStats.jitterMs === 34 &&
          snapshot.audioStats.jitterBufferDelayMs === 200 &&
          snapshot.audioStats.packetsLost === 3 &&
          snapshot.audioStats.packetsReceived === 180 &&
          snapshot.audioStats.concealedSamples === 960 &&
          snapshot.audioStats.roundTripTimeMs === 120 &&
          snapshot.audioStats.localCandidateType === "relay" &&
          snapshot.audioStats.remoteCandidateType === "host" &&
          snapshot.audioStats.transportProtocol === "udp" &&
          snapshot.audioStats.relayFallbackReason === "local-nat-or-firewall-fallback"
        ),
      ).toBe(true);
    });
  });

  test("keeps the audio indicator stable during short remote mute events", async () => {
    const listeners = new Map<string, () => void>();
    const audioTrack = {
      enabled: true,
      muted: false,
      readyState: "live",
      addEventListener: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      removeEventListener: vi.fn(),
    };
    const remoteStream = {
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    vi.useFakeTimers();
    act(() => {
      peerConnections[0].emitRemoteTrack([remoteStream]);
    });
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-active", "true");

    act(() => {
      audioTrack.muted = true;
      listeners.get("mute")?.();
      vi.advanceTimersByTime(1199);
    });
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-active", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-active", "false");

    act(() => {
      audioTrack.muted = false;
      listeners.get("unmute")?.();
    });
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-active", "true");
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
        status: 422,
        text: vi.fn(),
      })),
    );

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    expect(await screen.findByText("WHEP request failed with 422")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("error");
  });

  test("retries a WHEP 404 while the stream path is not ready", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: vi.fn() })
      .mockResolvedValueOnce(successfulWhepResponse);
    vi.stubGlobal("fetch", fetcher);

    render(<WebRTCPlayer whepUrl="https://media.example.test/talkback/raw/local/webcam/operator/whep" />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2), { timeout: 1_500 });
    expect(peerConnections[0].setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "mock-answer-sdp",
    });
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

  test("posts the WHEP offer after a bounded ICE gathering wait", async () => {
    initialIceGatheringState = "gathering";

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);

    await waitFor(() => expect(peerConnections[0].setLocalDescription).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalledWith(
      "https://media.example.test/raw/sample/front/whep",
      expect.objectContaining({ method: "POST" }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "https://media.example.test/raw/sample/front/whep",
        expect.objectContaining({ method: "POST" }),
      ),
      { timeout: 3500 },
    );
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
