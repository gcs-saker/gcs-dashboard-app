import { describe, expect, it, vi } from "vitest";
import { publishTalkbackTarget } from "./talkbackWhipSession";

describe("talkbackWhipSession", () => {
  it("publishes talkback audio with a WHIP offer", async () => {
    const audioTrack = {} as MediaStreamTrack;
    const peerConnection = peer();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ whipUrl: "/webrtc/authorized-talkback/whip?publisherToken=short-lived", iceServers: [] }))
      .mockResolvedValueOnce(new Response("v=0\r\nanswer", { status: 200 })) as unknown as typeof fetch;

    const result = await publishTalkbackTarget({
      audioTracks: [audioTrack],
      fetcher,
      iceServers: [{ urls: "stun:example.test:19302" }],
      operatorId: "operator01",
      peerConnectionFactory: () => peerConnection,
      streamId: "raw.sample.front",
    });

    expect(result.status).toBe("active");
    expect(result.peerConnection).toBe(peerConnection);
    expect(peerConnection.addTrack).toHaveBeenCalledWith(audioTrack);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/webrtc/authorized-talkback/whip?publisherToken=short-lived",
      expect.objectContaining({ method: "POST", body: "v=0\r\noffer" }),
    );
  });

  it("closes the peer connection when WHIP signaling fails", async () => {
    const peerConnection = peer();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ whipUrl: "/webrtc/authorized-talkback/whip?publisherToken=short-lived", iceServers: [] }))
      .mockResolvedValueOnce(new Response("", { status: 502 })) as unknown as typeof fetch;

    const result = await publishTalkbackTarget({
      audioTracks: [{} as MediaStreamTrack],
      fetcher,
      iceServers: [],
      peerConnectionFactory: () => peerConnection,
      streamId: "raw.sample.front",
    });

    expect(result).toEqual({
      streamId: "raw.sample.front",
      status: "error",
      errorMessage: "talkback WHIP failed with 502",
      peerConnection: null,
    });
    expect(peerConnection.close).toHaveBeenCalledOnce();
  });
});

function peer(): RTCPeerConnection {
  return {
    iceGatheringState: "complete",
    localDescription: { type: "offer", sdp: "v=0\r\noffer" },
    addTrack: vi.fn(),
    close: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\noffer" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
  } as unknown as RTCPeerConnection;
}
