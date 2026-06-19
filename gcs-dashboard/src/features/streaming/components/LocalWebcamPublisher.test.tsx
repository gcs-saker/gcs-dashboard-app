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
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
      },
    });

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

  test("can select a rear-camera stream target before publishing", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      enumerateDevices: vi.fn(async () => []),
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
        whipUrl="http://media.example.test/webrtc/raw/local/webcam/whip"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "송출 stream 선택" }), {
      target: { value: "raw.local.rear" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "카메라 입력 선택" }), {
      target: { value: "__rear_camera__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));

    await waitFor(() => {
      expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: { ideal: "environment" } },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"));
    expect(fetcher).toHaveBeenCalledWith(
      "http://media.example.test/webrtc/raw/local/rear/whip",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("keeps device selection available while published and resets capture when the camera changes", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      enumerateDevices: vi.fn(async () => [
        createMediaDevice("videoinput", "camera-1", "Front Camera"),
        createMediaDevice("videoinput", "camera-2", "Rear Camera"),
      ]),
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

    await screen.findByRole("option", { name: "Rear Camera" });
    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"));

    const cameraSelect = screen.getByRole("combobox", { name: "카메라 입력 선택" });
    expect(cameraSelect).not.toBeDisabled();

    fireEvent.change(cameraSelect, { target: { value: "camera-2" } });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("대기"));
    expect(track.stop).toHaveBeenCalled();
    expect(peerConnection.close).toHaveBeenCalled();
    expect(cameraSelect).toHaveValue("camera-2");
    expect(screen.getByRole("button", { name: "카메라 준비" })).toBeEnabled();
  });

  test("can use an enumerated camera and disable microphone capture", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      enumerateDevices: vi.fn(async () => [
        createMediaDevice("videoinput", "camera-2", "Rear USB"),
        createMediaDevice("audioinput", "mic-1", "Desk Mic"),
      ]),
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;

    render(<LocalWebcamPublisher mediaDevices={mediaDevices} />);

    await screen.findByRole("option", { name: "Rear USB" });
    fireEvent.change(screen.getByRole("combobox", { name: "카메라 입력 선택" }), {
      target: { value: "camera-2" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "마이크 입력 선택" }), {
      target: { value: "__no_microphone__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));

    await waitFor(() => {
      expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: "camera-2" } },
        audio: false,
      });
    });
  });

  test("can switch publisher audio capture to quality mode before preview", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;

    render(<LocalWebcamPublisher mediaDevices={mediaDevices} />);

    expect(screen.getByText("브라우저 음성 후처리를 줄여 지연을 우선합니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "음질" }));
    expect(screen.getByText("잡음/에코 처리를 켜지만 지연이 늘 수 있습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));

    await waitFor(() => {
      expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    });
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

  test("posts browser GPS telemetry while publishing", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;
    const peerConnection = createPeerConnectionMock();
    const geolocation = createGeolocationMock({
      latitude: 35.8842,
      longitude: 128.6123,
      altitude: 44,
      speed: 1.5,
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    })) as unknown as typeof fetch;

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={() => peerConnection}
        fetcher={fetcher}
        geolocation={geolocation}
        streamId="raw.local.webcam"
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

    await waitFor(() => expect(screen.getByText(/GPS: 수신 중/)).toHaveTextContent("35.884200, 128.612300"));
    expect(fetcher).toHaveBeenCalledWith(
      "/api/telemetry/",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"uuid":"raw.local.webcam"'),
      }),
    );
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

  test("detects a dropped publisher media connection and retries WHIP signaling", async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn(async () => mediaStream),
    } as unknown as MediaDevices;
    const firstPeerConnection = createPeerConnectionMock();
    const secondPeerConnection = createPeerConnectionMock();
    const peerConnectionFactory = vi.fn()
      .mockReturnValueOnce(firstPeerConnection)
      .mockReturnValueOnce(secondPeerConnection);
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    })) as unknown as typeof fetch;

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={peerConnectionFactory}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    expect(await screen.findByRole("status")).toHaveTextContent("미리보기 준비");

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"));
    await screen.findByText("WebRTC 미디어 연결이 완료되어 송출 중입니다.");

    firstPeerConnection.disconnect();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("재연결 중"));
    expect(screen.getByText(/송출 미디어 연결이 끊겼습니다/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"), { timeout: 2_000 });
    expect(peerConnectionFactory).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

type PeerConnectionMock = RTCPeerConnection & {
  completeIceGathering: () => void;
  completeConnection: () => void;
  disconnect: () => void;
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
    disconnect() {
      connectionState = "disconnected";
      iceConnectionState = "disconnected";
      connectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
  } as unknown as PeerConnectionMock;
  return peerConnection;
}

function createGeolocationMock(coords: Partial<GeolocationCoordinates>): Geolocation {
  const position = {
    coords: {
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 0,
      longitude: 0,
      speed: null,
      toJSON: () => ({}),
      ...coords,
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
  return {
    getCurrentPosition: vi.fn((success: PositionCallback) => success(position)),
    watchPosition: vi.fn((success: PositionCallback) => {
      success(position);
      return 7;
    }),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
}

function createMediaDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "mock-group",
    kind,
    label,
    toJSON: () => ({ deviceId, groupId: "mock-group", kind, label }),
  };
}
