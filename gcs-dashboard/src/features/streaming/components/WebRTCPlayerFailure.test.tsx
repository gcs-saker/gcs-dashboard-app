import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WebRTCPlayer } from "./WebRTCPlayer";
import {
  peerConnections,
  setInitialIceGatheringState,
  successfulWhepResponse,
} from "./WebRTCPlayer.testHarness";
describe("WebRTCPlayer failure handling", () => {
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
    setInitialIceGatheringState("gathering");

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
    setInitialIceGatheringState("gathering");

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
