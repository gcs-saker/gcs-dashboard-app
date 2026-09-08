import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WebRTCPlayer } from "./WebRTCPlayer";
import {
  peerConnections,
} from "./WebRTCPlayer.testHarness";
describe("WebRTCPlayer media telemetry", () => {
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
    expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-playback-state", "receiving");
    expect(screen.getByText("audio receiving")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasAudioTrack: true,
        isAudioActive: true,
        audioPlaybackState: "receiving",
        audioDiagnosticMessage: "오디오 수신 중",
      }),
    );
  });

  test("separates received audio tracks from browser autoplay blocks", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("autoplay blocked"));
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

    render(<WebRTCPlayer whepUrl="https://media.example.test/raw/sample/front/whep" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    act(() => {
      peerConnections[0].emitRemoteTrack([remoteStream]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-has-audio-track", "true");
      expect(screen.getByTestId("webrtc-player")).toHaveAttribute("data-audio-playback-state", "playback-blocked");
    });
    expect(screen.getByText("audio blocked")).toHaveAttribute(
      "title",
      "브라우저 자동재생 정책으로 오디오 재생이 차단됨",
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
});
