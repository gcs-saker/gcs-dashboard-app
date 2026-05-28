import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LocalWebcamPublisher } from "./LocalWebcamPublisher";

describe("LocalWebcamPublisher", () => {
  test("shows an unsupported state when getUserMedia is unavailable", async () => {
    render(<LocalWebcamPublisher mediaDevices={undefined as unknown as MediaDevices} />);

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));

    expect(await screen.findByRole("status")).toHaveTextContent("지원 안 됨");
    expect(screen.getByText("이 브라우저에서는 카메라 캡처를 지원하지 않습니다.")).toBeInTheDocument();
  });

  test("starts preview and publishes a WHIP offer", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;
    const peerConnection = createPeerConnectionMock();
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    })) as unknown as typeof fetch;

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={() => peerConnection}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"));
    expect(peerConnection.addTrack).toHaveBeenCalledWith(track, mediaStream);
    expect(fetcher).toHaveBeenCalledWith(
      "http://media.example.test/raw/local/webcam/whip",
      expect.objectContaining({
        method: "POST",
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: "v=0\r\nmock-offer",
      }),
    );
  });

  test("waits for ICE gathering before sending the WHIP offer", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;
    const peerConnection = createPeerConnectionMock("gathering");
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    })) as unknown as typeof fetch;

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={() => peerConnection}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

    await waitFor(() => expect(peerConnection.setLocalDescription).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("ICE 후보 수집");
    expect(screen.getByText("STUN/TURN ICE 서버를 이용해 후보를 수집하고 있습니다.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();

    peerConnection.completeIceGathering();

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("송출 중");
  });

  test("uses the configured STUN server for the default WHIP peer connection", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;
    const originalPeerConnection = globalThis.RTCPeerConnection;
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    })) as unknown as typeof fetch;
    const peerConnection = createPeerConnectionMock();
    const peerConnectionConstructor = vi.fn(() => peerConnection);
    globalThis.RTCPeerConnection = peerConnectionConstructor as unknown as typeof RTCPeerConnection;

    try {
      render(
        <LocalWebcamPublisher
          mediaDevices={mediaDevices}
          fetcher={fetcher}
          whipUrl="http://media.example.test/raw/local/webcam/whip"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
      expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

      fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

      await waitFor(() => expect(peerConnectionConstructor).toHaveBeenCalled());
      expect(peerConnectionConstructor).toHaveBeenCalledWith({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
    } finally {
      globalThis.RTCPeerConnection = originalPeerConnection;
    }
  });

  test("shows a clear error when camera permission is denied", async () => {
    const mediaDevices = {
      getUserMedia: vi.fn(async () => {
        throw new Error("Permission denied");
      }),
    } as unknown as MediaDevices;

    render(<LocalWebcamPublisher mediaDevices={mediaDevices} />);

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));

    expect(await screen.findByRole("status")).toHaveTextContent("오류");
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});

type PeerConnectionMock = RTCPeerConnection & {
  completeIceGathering: () => void;
  completeConnection: () => void;
};

function createPeerConnectionMock(initialIceGatheringState: RTCIceGatheringState = "complete"): PeerConnectionMock {
  let iceGatheringState = initialIceGatheringState;
  let connectionState: RTCPeerConnectionState = "connected";
  let iceConnectionState: RTCIceConnectionState = "connected";
  let iceGatheringStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let connectionStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let iceConnectionStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  const peerConnection = {
    get connectionState() {
      return connectionState;
    },
    get iceConnectionState() {
      return iceConnectionState;
    },
    get iceGatheringState() {
      return iceGatheringState;
    },
    get onicegatheringstatechange() {
      return iceGatheringStateChangeHandler;
    },
    set onicegatheringstatechange(handler) {
      iceGatheringStateChangeHandler = handler;
    },
    get onconnectionstatechange() {
      return connectionStateChangeHandler;
    },
    set onconnectionstatechange(handler) {
      connectionStateChangeHandler = handler;
    },
    get oniceconnectionstatechange() {
      return iceConnectionStateChangeHandler;
    },
    set oniceconnectionstatechange(handler) {
      iceConnectionStateChangeHandler = handler;
    },
    localDescription: { type: "offer", sdp: "v=0\r\nmock-offer" },
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\nmock-offer" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
    completeIceGathering() {
      iceGatheringState = "complete";
      iceGatheringStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("icegatheringstatechange"));
    },
    completeConnection() {
      connectionState = "connected";
      iceConnectionState = "connected";
      connectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
  } as unknown as PeerConnectionMock;
  return peerConnection;
}
