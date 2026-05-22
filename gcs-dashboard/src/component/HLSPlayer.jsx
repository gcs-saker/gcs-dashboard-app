// src/components/HLSPlayer.jsx
import React, { useRef, useEffect } from "react";
import { hlsStreamUrl } from "../config";

const HLSPlayer = ({
  src = hlsStreamUrl("gcs"),
  width = "100%",
  height = "100%",
  rotate = 0,
  onVideoInfo,
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let disposed = false;
    let cleanup;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const onLoadedMetadata = () => {
        video.play();
      };

      video.src = src;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      return () => {
        disposed = true;
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeAttribute("src");
      };
    }

    import("hls.js").then(({ default: Hls }) => {
      if (disposed) return;

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play();
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log("Available levels:", data.levels);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          const level = hls.levels[data.level];
          if (!level || !onVideoInfo) return;
          onVideoInfo({
            width: level.width,
            height: level.height,
            bitrate: level.bitrate,
            fps: level.fps,
          });
          console.log("Current level:", level);
        });

        cleanup = () => {
          hls.destroy();
        };
        return;
      }

      console.error("HLS not supported in this browser");
    }).catch((error) => {
      if (!disposed) {
        console.error("Failed to load HLS runtime", error);
      }
    });

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, [src, onVideoInfo]);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        objectFit: "cover",
        backgroundColor: "#000",
      }}
    >
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "100%",
          height: "100%",
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
          transformOrigin: "center center",
          objectFit: "cover",
        }}
      />
    </div>
  );
};

export default HLSPlayer;
