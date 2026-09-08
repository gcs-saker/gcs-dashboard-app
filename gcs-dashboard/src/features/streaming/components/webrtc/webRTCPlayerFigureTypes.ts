import type { RefObject } from "react";

import type { WebRTCPlaybackSnapshot } from "@streaming/types";

export interface WebRTCPlayerFigureProps extends WebRTCPlaybackSnapshot {
  autoPlay: boolean;
  muted: boolean;
  controls: boolean;
  showDiagnostics: boolean;
  className?: string;
  streamId?: string;
  title: string;
  videoRef: RefObject<HTMLVideoElement | null>;
}
