import type { Dispatch, MutableRefObject, RefObject } from "react";

import { monitorAudioLevel } from "./whepAudioLevelMonitor";
import { monitorAudioState } from "./whepPlaybackAudio";
import type { PlaybackAction } from "./whepPlaybackContracts";
import type { WhepPlaybackSession } from "./whepPlaybackSession";
import { requestVideoPlayback } from "./whepPlaybackConnection";

export interface WhepPlaybackMediaRefs {
  videoRef: RefObject<HTMLVideoElement | null>;
  remoteStreamRef: MutableRefObject<MediaStream | null>;
}

export function createWhepTrackHandler(
  refs: WhepPlaybackMediaRefs,
  session: WhepPlaybackSession,
  dispatch: Dispatch<PlaybackAction>,
): RTCPeerConnection["ontrack"] {
  return (event) => {
    if (!refs.videoRef.current) return;

    const stream = event.streams[0] ?? ensureRemoteStream(refs.remoteStreamRef, event.track);
    replaceAudioMonitors(stream, session, dispatch);
    refs.videoRef.current.srcObject = stream;
    requestVideoPlayback(refs.videoRef.current, dispatch);
  };
}

function ensureRemoteStream(
  remoteStreamRef: MutableRefObject<MediaStream | null>,
  track: MediaStreamTrack,
): MediaStream {
  if (!remoteStreamRef.current) {
    remoteStreamRef.current = new MediaStream();
  }
  remoteStreamRef.current.addTrack(track);
  return remoteStreamRef.current;
}

function replaceAudioMonitors(
  stream: MediaStream,
  session: WhepPlaybackSession,
  dispatch: Dispatch<PlaybackAction>,
): void {
  session.stopAudioMonitor?.();
  session.stopAudioLevelMonitor?.();
  session.stopAudioMonitor = monitorAudioState(stream, dispatch);
  session.stopAudioLevelMonitor = monitorAudioLevel(stream, dispatch);
}
