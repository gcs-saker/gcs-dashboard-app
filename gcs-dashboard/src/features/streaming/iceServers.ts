import { streamApiV1Url, WEBRTC_ICE_SERVERS } from "../../config";
import { authenticatedFetch } from "../auth/authApi";

interface IceServerPayload {
  urls?: string | string[];
  username?: string | null;
  credential?: string | null;
}

export async function loadWebRtcIceServers(fetcher: typeof fetch = fetch): Promise<RTCIceServer[]> {
  try {
    const response = await authenticatedFetch(
      streamApiV1Url("/streams/ice-servers"),
      {
        headers: { Accept: "application/json" },
      },
      fetcher,
    );
    if (!response.ok) {
      return WEBRTC_ICE_SERVERS;
    }

    const payload = (await response.json()) as IceServerPayload[];
    const iceServers = payload.map(toIceServer).filter((server): server is RTCIceServer => server !== null);
    return iceServers.length > 0 ? iceServers : WEBRTC_ICE_SERVERS;
  } catch {
    return WEBRTC_ICE_SERVERS;
  }
}

function toIceServer(payload: IceServerPayload): RTCIceServer | null {
  if (!payload.urls) {
    return null;
  }

  return {
    urls: payload.urls,
    ...(payload.username ? { username: payload.username } : {}),
    ...(payload.credential ? { credential: payload.credential } : {}),
  };
}
