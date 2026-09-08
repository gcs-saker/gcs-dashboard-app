import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LocalWebcamPublisher } from "./LocalWebcamPublisher";
import {
  createMediaDevice,
  createPeerConnectionMock,
  createPublisherFetcher,
} from "./LocalWebcamPublisher.testUtils";

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
    const fetcher = createPublisherFetcher();

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={() => peerConnection}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));
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
      "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
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
    const fetcher = createPublisherFetcher();

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

    await waitFor(() => expect(fetcher).toHaveBeenCalled(), { timeout: 5_000 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"), { timeout: 5_000 });
    expect(fetcher).toHaveBeenCalledWith(
      "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
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
    const fetcher = createPublisherFetcher();

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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));

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
    const fetcher = createPublisherFetcher();

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={() => peerConnection}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

    await waitFor(() => expect(peerConnection.setLocalDescription).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("ICE 후보 수집");
    expect(screen.getByText("STUN/TURN ICE 서버를 이용해 후보를 수집하고 있습니다.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/streams/raw.local.webcam/publish"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
      expect.objectContaining({ method: "POST" }),
    );

    peerConnection.completeIceGathering();

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.getByRole("status")).toHaveTextContent("송출 중");
  });
});
