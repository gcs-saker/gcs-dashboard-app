import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LocalWebcamPublisher } from "./LocalWebcamPublisher";

describe("LocalWebcamPublisher", () => {
  test("shows an unsupported state when getUserMedia is unavailable", async () => {
    render(<LocalWebcamPublisher mediaDevices={undefined as unknown as MediaDevices} />);

    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));

    expect(await screen.findByRole("status")).toHaveTextContent("unsupported");
    expect(screen.getByText("Camera capture is not supported in this browser.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
    expect(await screen.findByRole("status")).toHaveTextContent("previewing");

    fireEvent.click(screen.getByRole("button", { name: "Publish WebRTC" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("published"));
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

      fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
      expect(await screen.findByRole("status")).toHaveTextContent("previewing");

      fireEvent.click(screen.getByRole("button", { name: "Publish WebRTC" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));

    expect(await screen.findByRole("status")).toHaveTextContent("error");
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});

function createPeerConnectionMock(): RTCPeerConnection {
  return {
    localDescription: { type: "offer", sdp: "v=0\r\nmock-offer" },
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\nmock-offer" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
  } as unknown as RTCPeerConnection;
}
