import React, { useEffect, useState } from "react";
import MainMap from "./MainMap";
import HLSPlayer from "./HLSPlayer";
import ControlPanel from "./ControlPanel";
import AzimuthReturn from "./AzimuthReturn";

export default function MainBody({
  telemetryMap,
  setTelemetryMap,
  selectedUUID,
  selectedData,
  resolution,
  handleResolutionChange,
  videoInfo,
  setVideoInfo,
  width,
  height
}) {

const [startIndex, setStartIndex] = useState(0);
  return (
    <div className="responsive-box">
      <div className="dashboard">
        <div className="main-content">
          {/* Left - MAP */}
          <div className="left-panel">
            {/* setTelemetryMap은 그대로 사용 */}
            <h3 className="subpanel__title"><img src="/icon/지도맵.png" className="iconh3 icon-text" alt="지도맵"/> 지도뷰</h3>
            <div className="mapbox">
                <MainMap setTelemetryMap={setTelemetryMap} />
            </div>
            {/* 썸네일 캐러셀 */}
            <div className="thumbnail-timeline">
            {Object.keys(telemetryMap).map((uuid) => {
                const data = telemetryMap[uuid];
                return (
                <div className="thumb-item" key={uuid}>
                    {/* 썸네일 영상 */}
                    <div className="thumb-preview">
                    <HLSPlayer
                        key={`thumb-${uuid}`}
                        src={`http://www.saker.ai.kr:8888/stream/${uuid}/index.m3u8`}
                        width="100%"
                        height="100%"
                        rotate={0}
                        onVideoInfo={() => {}}
                    />
                    </div>

                    {/* 하단 정보 */}
                    <div className="thumb-info">
                    <span className="uuid-label">{uuid}</span>
                    <span className="time-label">{data?.epochTime || "-"}</span>
                    </div>
                </div>
                );
            })}
            </div>


          </div>

          {/* Right - VIDEO + ALERT */}
          <div className="right-panel">
            <div className="video__header">
            <div className="row">
              <h3 className="h3"> 
                <img src="/icon/영상뷰.png" className="iconh3 icon-text" alt="영상뷰"/> 메인영상
              </h3>
            </div>
            
            
          </div>
          <div className="video-stream">
            
                <HLSPlayer
                    key = {selectedUUID}
                    src= {`http://www.saker.ai.kr:8888/stream/${selectedUUID}/index.m3u8`}
                    width={`${width}%`}
                    height={`${height}%`}
                    rotate={0}
                    onVideoInfo={setVideoInfo}
                />
                </div>
                <div className="compass2">
                <div className="compass2__ring">
                    <AzimuthReturn mx={selectedData?.magneticX ?? 0}
                    my={selectedData?.magneticY ?? 0}/>
                    </div>
                </div>
                <br/>
                <h3 className="subpanel__title"><img src="/icon/실시간뷰.png" className="iconh3 icon-text" alt="실시간뷰"/> 실시간뷰</h3>
                <aside className="video__rail">
                    <div className="rail__group">
                    <div className="row row--split">
                        <span className="label"><img src="/icon/해상도변경.png" className="icon icon-muted" alt="해상도 변경"/> 해상도 변경(비율)</span>
                        <span className="u-muted">{resolution}</span>
                    </div>
                    <input type="range" min="1" max="10" 
                        value={resolution} onChange={handleResolutionChange}
                        list="tickmarks"/>
                    <datalist id="tickmarks">
                        <option value="1" label="10%"></option>
                        <option value="2" label="20%"></option>
                        <option value="3" label="30%"></option>
                        <option value="4" label="40%"></option>
                        <option value="5" label="50%"></option>
                        <option value="6" label="60%"></option>
                        <option value="7" label="70%"></option>
                        <option value="8" label="80%"></option>
                        <option value="9" label="90%"></option>
                        <option value="10" label="100%"></option>
                    </datalist>
                    
                    {selectedData && (
                    <div className="realtime__stats">
                        {[
                        ["기본화소(PX)", `${videoInfo.width} X ${videoInfo.height}`, "/icon/기본화소.png"],
                        ["비트레이트", `${videoInfo.bitrate}`, "/icon/분기.png"],
                        ["FPS(Frame Per Second)", `${videoInfo.fps || 30}`, "/icon/fps.png"],
                        ["위경도", `${selectedData.latitude?.toFixed?.(5) ?? "-"}, ${selectedData.longitude?.toFixed?.(5) ?? "-"}`, "/icon/위경도.png"],
                        ["고도(m)", selectedData.altitude?.toFixed?.(1) ?? "-", "/icon/고도.png"],
                        ["지자계 각도", `${selectedData?.magneticX ?? 0}, ${selectedData?.magneticY ?? 0}, ${selectedData?.magneticZ ?? 0}`, "/icon/지자계.png"]
                        ].map(([k, v, icon], i) => {
                        
                        return (
                            <div className="stat" key={i}>
                            <div className="stat__k">
                                <img src={icon} className="icon icon-muted" alt={k} /> {k}
                            </div>
                            <div className="stat__v">{v}</div>
                            </div>
                        );
                        })}
                    </div>
                    )}
                    </div>
                </aside>
                
            </div>
          </div>
        </div>
   
    </div>
  );
}
