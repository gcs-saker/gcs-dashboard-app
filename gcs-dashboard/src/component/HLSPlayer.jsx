// src/components/HLSPlayer.jsx
import React, { useRef, useEffect } from "react";
import Hls from "hls.js";
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
    let hls;

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        video.play();
      });
    } else {
      console.error("HLS not supported in this browser");
    }

    if (hls) {
      // 레벨 정보 로드 완료 시
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log("Available levels:", data.levels);
      });

      // 레벨 스위치 시 (자동 화질 변경 포함)
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
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

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
