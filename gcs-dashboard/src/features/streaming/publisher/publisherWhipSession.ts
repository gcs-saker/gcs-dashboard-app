import { WEBRTC_ICE_SERVERS } from "@/config";
import { loadWebRtcIceServers } from "@streaming/iceServers";
import { SDP_OFFER_HEADERS } from "@streaming/streamingProtocolHeaders";
import { fetchAuthorizedPublishSession } from "./publisherApi";
import type { PublisherStepId, WebcamPublisherStatus } from "./publisherContracts";
import { waitForIceGatheringComplete, waitForPeerConnectionReady } from "./publisherWebRtc";

export class PublisherWhipSessionError extends Error {
  readonly step: PublisherStepId;

  constructor(step: PublisherStepId, cause: unknown) {
    super(cause instanceof Error ? cause.message : "로컬 웹캠 송출에 실패했습니다.");
    this.name = "PublisherWhipSessionError";
    this.step = step;
  }
}

interface StartPublisherWhipSessionInput {
  fetcher: typeof fetch;
  mediaStream: MediaStream;
  onConnectionChange: (peerConnection: RTCPeerConnection) => void;
  onPeerConnection: (peerConnection: RTCPeerConnection) => void;
  onStatus: (status: WebcamPublisherStatus) => void;
  peerConnectionFactory?: () => RTCPeerConnection;
  streamId: string;
}

export async function startPublisherWhipSession({
  fetcher,
  mediaStream,
  onConnectionChange,
  onPeerConnection,
  onStatus,
  peerConnectionFactory,
  streamId,
}: StartPublisherWhipSessionInput): Promise<void> {
  let currentStep: PublisherStepId = "ice";
  try {
    onStatus("creating-offer");
    const publishSession = await fetchAuthorizedPublishSession(streamId, fetcher);
    const iceServers = peerConnectionFactory
      ? WEBRTC_ICE_SERVERS
      : await resolvePublisherIceServers(fetcher, publishSession.iceServers);
    const peerConnection = peerConnectionFactory?.() ?? new RTCPeerConnection({ iceServers });
    onPeerConnection(peerConnection);
    peerConnection.onconnectionstatechange = () => onConnectionChange(peerConnection);
    peerConnection.oniceconnectionstatechange = () => onConnectionChange(peerConnection);
    for (const track of mediaStream.getTracks()) peerConnection.addTrack(track, mediaStream);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    onStatus("gathering-ice");
    await waitForIceGatheringComplete(peerConnection);
    const sdp = peerConnection.localDescription?.sdp;
    if (!sdp) throw new Error("로컬 WebRTC offer SDP가 생성되지 않았습니다.");

    currentStep = "signaling";
    onStatus("sending-offer");
    const response = await fetcher(publishSession.whipUrl, { method: "POST", headers: SDP_OFFER_HEADERS, body: sdp });
    if (!response.ok) throw new Error(`WHIP publish failed with ${response.status}`);

    const answer = await response.text();
    onStatus("signaling-complete");
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
    currentStep = "media";
    onStatus("connecting-media");
    await waitForPeerConnectionReady(peerConnection);
  } catch (error) {
    throw new PublisherWhipSessionError(currentStep, error);
  }
}

async function resolvePublisherIceServers(
  fetcher: typeof fetch,
  authorizedIceServers: RTCIceServer[],
): Promise<RTCIceServer[]> {
  if (authorizedIceServers.length > 0) {
    return authorizedIceServers;
  }
  return loadWebRtcIceServers(fetcher);
}
