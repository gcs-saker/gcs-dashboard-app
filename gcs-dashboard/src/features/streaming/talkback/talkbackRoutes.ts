import { TALKBACK_OPERATOR_ID } from "@/config";

export const TALKBACK_MEDIA_PATH_PREFIX = "talkback";
export const TALKBACK_WHIP_SUFFIX = "whip";
export const TALKBACK_WHEP_SUFFIX = "whep";

export function streamIdToMediaPath(streamId: string): string {
  return streamId.trim().split(".").filter(Boolean).join("/");
}

export function talkbackMediaPath(streamId: string, operatorId = TALKBACK_OPERATOR_ID): string {
  return [
    TALKBACK_MEDIA_PATH_PREFIX,
    streamIdToMediaPath(streamId),
    encodeURIComponent(operatorId.trim() || TALKBACK_OPERATOR_ID),
  ].join("/");
}

export function talkbackWhipUrl(streamId: string, operatorId = TALKBACK_OPERATOR_ID): string {
  return `/webrtc/${talkbackMediaPath(streamId, operatorId)}/${TALKBACK_WHIP_SUFFIX}`;
}

export function talkbackWhepUrl(streamId: string, operatorId = TALKBACK_OPERATOR_ID): string {
  return `/webrtc/${talkbackMediaPath(streamId, operatorId)}/${TALKBACK_WHEP_SUFFIX}`;
}
