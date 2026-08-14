import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LocalWebcamPublisher } from "./LocalWebcamPublisher";
import {
  createGeolocationMock,
  createPeerConnectionMock,
  createPublisherFetcher,
} from "./LocalWebcamPublisher.testUtils";

describe("LocalWebcamPublisher telemetry and recovery", () => {
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
    const fetcher = createPublisherFetcher();

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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));

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
    const fetcher = createPublisherFetcher();
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
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));

      fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));

      await waitFor(() => expect(peerConnectionConstructor).toHaveBeenCalled());
      expect(peerConnectionConstructor).toHaveBeenCalledWith({
        iceServers: [{ urls: "stun:a4ai.tplinkdns.com:3478" }],
      });
      expect(fetcher).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/streams/ice-servers"),
        expect.anything(),
      );
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
    const fetcher = createPublisherFetcher();

    render(
      <LocalWebcamPublisher
        mediaDevices={mediaDevices}
        peerConnectionFactory={peerConnectionFactory}
        fetcher={fetcher}
        whipUrl="http://media.example.test/raw/local/webcam/whip"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "카메라 준비" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("미리보기 준비"));

    fireEvent.click(screen.getByRole("button", { name: "시그널링 시작" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"));
    await screen.findByText("WebRTC 미디어 연결이 완료되어 송출 중입니다.");

    firstPeerConnection.disconnect();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("재연결 중"));
    expect(screen.getByText(/송출 미디어 연결이 끊겼습니다/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("송출 중"), { timeout: 2_000 });
    expect(peerConnectionFactory).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
