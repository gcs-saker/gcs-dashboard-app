import { afterEach, describe, expect, it, vi } from "vitest";
import {
  waitForIceGatheringComplete,
  waitForPeerConnectionReady,
} from "./publisherWebRtc";

describe("publisherWebRtc", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when ICE gathering is already complete", async () => {
    await expect(waitForIceGatheringComplete(peer({ iceGatheringState: "complete" }))).resolves.toBeUndefined();
  });

  it("waits for ICE gathering completion and preserves previous handler", async () => {
    vi.useFakeTimers();
    const previousHandler = vi.fn();
    const peerConnection = peer({ iceGatheringState: "gathering" });
    peerConnection.onicegatheringstatechange = previousHandler;

    const waiting = waitForIceGatheringComplete(peerConnection, 1_000);
    expect(peerConnection.onicegatheringstatechange).not.toBe(previousHandler);
    peerConnection.completeIceGathering();

    await expect(waiting).resolves.toBeUndefined();
    expect(previousHandler).toHaveBeenCalledOnce();
    expect(peerConnection.onicegatheringstatechange).toBe(previousHandler);
  });

  it("resolves when peer connection becomes ready", async () => {
    vi.useFakeTimers();
    const peerConnection = peer({ connectionState: "connecting", iceConnectionState: "checking" });

    const waiting = waitForPeerConnectionReady(peerConnection, 1_000);
    peerConnection.completeConnection();

    await expect(waiting).resolves.toBeUndefined();
  });

  it("rejects when peer connection fails", async () => {
    vi.useFakeTimers();
    const peerConnection = peer({ connectionState: "connecting", iceConnectionState: "checking" });

    const waiting = waitForPeerConnectionReady(peerConnection, 1_000);
    const expectedFailure = expect(waiting).rejects.toThrow("WebRTC ICE 미디어 연결이 실패했습니다.");
    peerConnection.failConnection();

    await expectedFailure;
  });

  it("rejects when media connection times out", async () => {
    vi.useFakeTimers();
    const peerConnection = peer({ connectionState: "connecting", iceConnectionState: "checking" });

    const waiting = waitForPeerConnectionReady(peerConnection, 25);
    const expectedFailure = expect(waiting).rejects.toThrow("시간 안에 완료되지 않았습니다");
    await vi.advanceTimersByTimeAsync(25);

    await expectedFailure;
  });
});

type MutablePeerConnection = RTCPeerConnection & {
  completeConnection: () => void;
  completeIceGathering: () => void;
  failConnection: () => void;
};

interface PeerInit {
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  iceGatheringState?: RTCIceGatheringState;
}

function peer({
  connectionState = "new",
  iceConnectionState = "new",
  iceGatheringState = "new",
}: PeerInit): MutablePeerConnection {
  let currentConnectionState = connectionState;
  let currentIceConnectionState = iceConnectionState;
  let currentIceGatheringState = iceGatheringState;
  let iceGatheringHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let connectionHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let iceConnectionHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;

  const peerConnection = {
    get connectionState() {
      return currentConnectionState;
    },
    get iceConnectionState() {
      return currentIceConnectionState;
    },
    get iceGatheringState() {
      return currentIceGatheringState;
    },
    get onicegatheringstatechange() {
      return iceGatheringHandler;
    },
    set onicegatheringstatechange(handler) {
      iceGatheringHandler = handler;
    },
    get onconnectionstatechange() {
      return connectionHandler;
    },
    set onconnectionstatechange(handler) {
      connectionHandler = handler;
    },
    get oniceconnectionstatechange() {
      return iceConnectionHandler;
    },
    set oniceconnectionstatechange(handler) {
      iceConnectionHandler = handler;
    },
    completeIceGathering() {
      currentIceGatheringState = "complete";
      iceGatheringHandler?.call(peerConnection as RTCPeerConnection, new Event("icegatheringstatechange"));
    },
    completeConnection() {
      currentConnectionState = "connected";
      currentIceConnectionState = "connected";
      connectionHandler?.call(peerConnection as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionHandler?.call(peerConnection as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
    failConnection() {
      currentConnectionState = "failed";
      currentIceConnectionState = "failed";
      connectionHandler?.call(peerConnection as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionHandler?.call(peerConnection as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
  } as MutablePeerConnection;

  return peerConnection;
}
