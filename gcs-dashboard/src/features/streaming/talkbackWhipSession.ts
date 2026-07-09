import { talkbackWhipUrl } from "./talkbackRoutes";
import { waitForIceGatheringComplete } from "./publisher/publisherWebRtc";
import { SDP_OFFER_HEADERS } from "./streamingProtocolHeaders";
import type {
  TalkbackPeerConnectionFactory,
  TalkbackTargetState,
} from "./talkbackPublisherContracts";

interface PublishTalkbackTargetOptions {
  audioTracks: MediaStreamTrack[];
  fetcher: typeof fetch;
  iceServers: RTCIceServer[];
  operatorId?: string;
  peerConnectionFactory?: TalkbackPeerConnectionFactory;
  streamId: string;
}

export type TalkbackTargetPublishResult = TalkbackTargetState & {
  peerConnection: RTCPeerConnection | null;
};

export async function publishTalkbackTarget({
  audioTracks,
  fetcher,
  iceServers,
  operatorId,
  peerConnectionFactory,
  streamId,
}: PublishTalkbackTargetOptions): Promise<TalkbackTargetPublishResult> {
  let peerConnection: RTCPeerConnection | null = null;
  try {
    peerConnection = peerConnectionFactory?.() ?? new RTCPeerConnection({ iceServers });
    for (const track of audioTracks) {
      peerConnection.addTrack(track);
    }
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);
    const sdp = peerConnection.localDescription?.sdp;
    if (!sdp) {
      throw new Error("talkback WebRTC offer SDP가 생성되지 않았습니다.");
    }
    const response = await fetcher(talkbackWhipUrl(streamId, operatorId), {
      method: "POST",
      headers: SDP_OFFER_HEADERS,
      body: sdp,
    });
    if (!response.ok) {
      throw new Error(`talkback WHIP failed with ${response.status}`);
    }
    await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
    return { streamId, status: "active", errorMessage: null, peerConnection };
  } catch (error) {
    peerConnection?.close();
    return {
      streamId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "talkback 송신 실패",
      peerConnection: null,
    };
  }
}
