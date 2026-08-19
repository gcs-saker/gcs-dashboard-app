import { WebRTCPlayerDiagnostics } from "./WebRTCPlayerDiagnostics";
import { webRTCPlayerDataAttributes } from "./webRTCPlayerDataAttributes";
import type { WebRTCPlayerFigureProps } from "./webRTCPlayerFigureTypes";

export function WebRTCPlayerFigure(props: WebRTCPlayerFigureProps) {
  const { autoPlay, className, controls, muted, showDiagnostics, title, videoRef } = props;
  return (
    <figure
      className={["webrtc-player", className].filter(Boolean).join(" ")}
      data-testid="webrtc-player"
      {...webRTCPlayerDataAttributes(props)}
    >
      <video
        ref={videoRef}
        data-testid="webrtc-video"
        aria-label={title}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        controls={controls}
        className="webrtc-player__video"
      />
      {showDiagnostics ? <WebRTCPlayerDiagnostics snapshot={props} streamId={props.streamId} /> : null}
    </figure>
  );
}
