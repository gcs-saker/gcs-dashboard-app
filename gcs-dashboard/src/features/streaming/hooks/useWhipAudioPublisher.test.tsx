import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useWhipAudioPublisher } from "./useWhipAudioPublisher";

class MockPeerConnection {
  addTrack = vi.fn();
  close = vi.fn(() => {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  });
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "v=0\r\ntalkback-offer" }) as RTCSessionDescriptionInit);
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn(async () => undefined);

  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: RTCSessionDescription | null = null;
  onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useWhipAudioPublisher", () => {
  test("publishes one operator audio WHIP session per selected stream", async () => {
    const audioTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const localStream = {
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    } as unknown as MediaDevices;
    const peerConnections: MockPeerConnection[] = [];
    const peerConnectionFactory = vi.fn(() => {
      const peerConnection = new MockPeerConnection();
      peerConnections.push(peerConnection);
      return peerConnection as unknown as RTCPeerConnection;
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => "v=0\r\ntalkback-answer",
    })) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useWhipAudioPublisher({
        mediaDevices,
        peerConnectionFactory,
        fetcher,
        operatorId: "operator01",
      }),
    );

    await act(async () => {
      await result.current.start(["raw.sample.front", "raw.sample.front", "raw.local.rear"]);
    });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });
    expect(peerConnectionFactory).toHaveBeenCalledTimes(2);
    expect(peerConnections[0].addTrack).toHaveBeenCalledWith(audioTrack);
    expect(fetcher).toHaveBeenCalledWith(
      "/webrtc/talkback/raw/sample/front/operator01/whip",
      expect.objectContaining({ method: "POST", body: "v=0\r\ntalkback-offer" }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/webrtc/talkback/raw/local/rear/operator01/whip",
      expect.objectContaining({ method: "POST", body: "v=0\r\ntalkback-offer" }),
    );

    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.targets).toEqual([
      { streamId: "raw.sample.front", status: "active", errorMessage: null },
      { streamId: "raw.local.rear", status: "active", errorMessage: null },
    ]);

    act(() => result.current.stop());

    expect(audioTrack.stop).toHaveBeenCalled();
    expect(peerConnections[0].close).toHaveBeenCalled();
    expect(peerConnections[1].close).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  test("rejects talkback start when no target stream is selected", async () => {
    const { result } = renderHook(() => useWhipAudioPublisher());

    await act(async () => {
      await result.current.start([]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("talkback 대상 stream을 선택해야 합니다.");
  });

  test("rejects talkback start when browser microphone capture is unavailable", async () => {
    const { result } = renderHook(() =>
      useWhipAudioPublisher({
        mediaDevices: {} as MediaDevices,
      }),
    );

    await act(async () => {
      await result.current.start(["raw.sample.front"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("이 브라우저에서는 마이크 송신을 지원하지 않습니다.");
  });

  test("keeps partial target failure visible without stopping successful talkback sessions", async () => {
    const audioTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const localStream = {
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    } as unknown as MediaDevices;
    const peerConnections: MockPeerConnection[] = [];
    const peerConnectionFactory = vi.fn(() => {
      const peerConnection = new MockPeerConnection();
      peerConnections.push(peerConnection);
      return peerConnection as unknown as RTCPeerConnection;
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => ({
      ok: !String(input).includes("rear"),
      status: String(input).includes("rear") ? 502 : 201,
      text: async () => "v=0\r\ntalkback-answer",
    })) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useWhipAudioPublisher({
        mediaDevices,
        peerConnectionFactory,
        fetcher,
        operatorId: "operator01",
      }),
    );

    await act(async () => {
      await result.current.start(["raw.sample.front", "raw.sample.rear"]);
    });

    expect(result.current.status).toBe("active");
    expect(result.current.errorMessage).toBe("1개 대상 송신 실패");
    expect(result.current.targets).toEqual([
      { streamId: "raw.sample.front", status: "active", errorMessage: null },
      { streamId: "raw.sample.rear", status: "error", errorMessage: "talkback WHIP failed with 502" },
    ]);
    expect(peerConnections[0].close).not.toHaveBeenCalled();
    expect(peerConnections[1].close).toHaveBeenCalled();
  });
});
