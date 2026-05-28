import { apiV1Url, WEBRTC_ICE_SERVERS } from "../../config";
import { buildAuthHeaders } from "../auth/authApi";

interface IceServerPayload {
  urls?: string | string[];
  username?: string | null;
  credential?: string | null;
}

export async function loadWebRtcIceServers(fetcher: typeof fetch = fetch): Promise<RTCIceServer[]> {
  try {
    const response = await fetcher(apiV1Url("/streams/ice-servers"), {
      headers: buildAuthHeaders({ Accept: "application/json" }),
    });
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
