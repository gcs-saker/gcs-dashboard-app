import React, { useState, useEffect } from "react";
import MainMap from "./MainMap";
import HLSPlayer from "./HLSPlayer";
import ControlPanel from "./ControlPanel";
import LazyGyroscope from "./LazyGyroscope";
import AzimuthReturn from "./AzimuthReturn";


export default function MainBody({
  telemetryMap,
  setTelemetryMap,
  selectedUUID,
  selectedData,
  resolution,
  unmanedAssetMap,
  handleResolutionChange,
  videoInfo,
  setVideoInfo,
  roverVolt,
  phoneVolt,
  width,
  height
}) {
  const [unmanedAssetUUID, setUnmanedAssetUUID] = useState("");

  // ✅ unmanedAssetMap이 변경되면 첫 번째 UUID로 초기화
  useEffect(() => {
    const keys = Object.keys(unmanedAssetMap);
    if (keys.length > 0 && !unmanedAssetUUID) {
      setUnmanedAssetUUID(keys[0]);
    }
  }, [unmanedAssetMap, unmanedAssetUUID]);
  return (
      <div className="main">
        {/* ===== Video Panel (center-left) ===== */}
        <section className="panel video">
          <div className="card">
          <div className="video__header">
            <div className="row">
              <h3 className="h3"> 
                <img src="/icon/영상뷰.png" className="iconh3 icon-text" alt="영상뷰"/> 영상뷰 
              </h3>
            </div>
            <div className="row row--split">
              <span className="pill pill--red">
                <img src="/icon/기본화소.png" className="icon icon-danger" alt="px"/>
                 {videoInfo.width} X {videoInfo.height} PX
              </span><br/><br/>
              <span className="pill">
                <img src="/icon/분기.png" className="icon icon-text" alt="px"/>
                 {videoInfo.bitrate} bitrate
              </span>
              <span className="pill">
                <img src="/icon/fps.png" className="icon icon-text" alt="fps"/>
                 {videoInfo.fps || 33} FPS
              </span>
            </div>
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
              
            </div>

            <div className="rail__group">
              <br/>
              
              <span className="label"><img src="/icon/지자계.png" className="icon icon-muted" alt="지자계"/> 지자계 각도</span>
              <LazyGyroscope
                mx={selectedData?.magneticX ?? 0}
                my={selectedData?.magneticY ?? 0}
                mz={selectedData?.magneticZ ?? 0}
                size={180}
              />
                x축 각도 :{selectedData?.magneticX ?? 0} <br/>
                y축 각도 :{selectedData?.magneticY ?? 0} <br/>
                z축 각도 :{selectedData?.magneticZ ?? 0} <br/>
            
            </div>
          </aside>
          </div>
          </div>
          <div className="video__stage">
            <div className="video__placeholder">
              <HLSPlayer
                key = {selectedUUID}
                src= {`http://www.saker.ai.kr:8888/stream/${selectedUUID}/index.m3u8`}
                width={`${width}%`}
                height={`${height}%`}
                rotate={0}
                onVideoInfo={setVideoInfo}
              />
            </div>
            <div className="reticle">
              <div className="reticle__dot" />
            </div>
            <div className="compass">
              <div className="compass__ring">
                <AzimuthReturn mx={selectedData?.magneticX ?? 0}
                my={selectedData?.magneticY ?? 0}/>
                </div>
            </div>
          </div>
        
          
        </section>

        {/* ===== Right Sidebar ===== */}
        <aside className="panel side">
          <div className="card side__title">
            <div>
              <select
                value={unmanedAssetUUID}
                onChange={(e) => setUnmanedAssetUUID(e.target.value)}
                className="dropdown"
              >
                <option value="">-- 노드 선택 --</option>
                {Object.keys(unmanedAssetMap).map((uuid) => (
                  <option key={uuid} value={uuid}>
                    {uuid}
                  </option>
                ))}
              </select>

              {unmanedAssetUUID && unmanedAssetMap[unmanedAssetUUID] ? (
                <>
                  <h3 className="h3">
                    <img src="/icon/탈것.png" className="iconh3 icon-text" alt="탈것" />{" "}
                    {unmanedAssetMap[unmanedAssetUUID].name || "자산"}
                  </h3>

                  <p className="u-muted">
                    {unmanedAssetMap[unmanedAssetUUID].description ||
                      "설명이 등록되지 않았습니다."}
                  </p>
                </>
              ) : (
                <p className="u-muted">노드를 선택하세요.</p>
              )}
            </div>

            {unmanedAssetUUID && unmanedAssetMap[unmanedAssetUUID]?.image_url && (
              <div className="avatar">
                <img
                  src={unmanedAssetMap[unmanedAssetUUID].image_url}
                  alt="아바타"
                  width="48px"
                  height="48px"
                />
              </div>
            )}
          </div>


          <div className="card">
            <div className="row row--split">
              <h3 className="h3"> <img src="/icon/신호없음.png" className="iconh3 icon-text" alt="알람 로그"/> 알람 & 로그</h3>
              <span className="u-muted">최근 이벤트</span>
            </div>

            <div className="log-list">
              {[
                { type: "obstacle", msg: "장애물 감지 (전방 1.2m)", time: "12:30:25" },
                { type: "battery", msg: "배터리 18% 이하 - 저전력 모드", time: "12:28:14" },
                { type: "ongoing", msg: "작업 50% 진행 완료", time: "12:25:10" },
                { type: "ongoing", msg: "작업 100% 완료 - 보고 필요", time: "12:20:01" },
              ].map((log, i) => (
                <div className={`log-item log-${log.type}`} key={i}>
                  <span className="log-time">{log.time}</span>
                  <span className="log-msg">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="row row--gap">
            <button className="btn btn--ghost">카메라1</button>
            <button className="btn btn--accent">카메라2</button>
            <button className="btn btn--ghost">카메라3</button>
          </div>
        </aside>

        {/* ===== Bottom: Real-time & Resolution + Control Pad ===== */}
        <section className="panel bottom">
          <div className="subpanel">
            <div className="realtime">
              <div className="realtime__map">
                <h3 className="subpanel__title"><img src="/icon/지도맵.png" className="iconh3 icon-text" alt="지도맵"/> 지도뷰</h3>
                <div className="mapbox">
                  <MainMap setTelemetryMap={setTelemetryMap} />
                </div>
              </div>

            </div>
          </div>

          <div className="subpanel">
          <h3 className="subpanel__title"><img src="/icon/실시간뷰.png" className="iconh3 icon-text" alt="실시간뷰"/> 실시간뷰</h3>
          {selectedData && (
          <div className="realtime__stats">
            {[
              ["위경도", `${selectedData.latitude?.toFixed?.(5) ?? "-"}, ${selectedData.longitude?.toFixed?.(5) ?? "-"}`, "/icon/위경도.png"],
              ["고도(m)", selectedData.altitude?.toFixed?.(1) ?? "-", "/icon/고도.png"],
              ["무인체 배터리(%)", selectedData.soc ?? "-", "/icon/배터리.png"],
              ["게이트웨이 배터리(%)", selectedData.phoneBatterySOC ?? "-", "/icon/스마트폰 배터리.png"],
              ["속도(m/s)", selectedData.velocity?.toFixed?.(2) ?? "-", "/icon/속도.png"],
              ["주행시간(s)", selectedData.epochTime ?? "-", "/icon/주행시간.png"],
              ["주행거리(m)", selectedData.totalDistance?.toFixed?.(2) ?? "-", "/icon/주행거리.png"],
              ["충전소 거리(m)", selectedData.portDistance?.toFixed?.(2) ?? "-", "/icon/충전소거리.png"],
            ].map(([k, v, icon], i) => {
              if (i === 2) {
                return (
                  <div className="stat special" key={i}>
                    <div className="stat__k">
                      <img src={icon} className="icon icon-muted" alt={k} /> {k}
                    </div>
                    <div className="stat__v">{v}</div>
                    <div className="progress">
                      <div
                        className="progress__bar"
                        style={{ width: `${Number(selectedData?.soc ?? 0)}%` }}
                      />
                    </div>
                    <div className="row">
                      <span className="u-strong">{selectedData?.soc ?? "-"}</span>
                      <span className="u-muted">{roverVolt} / 12.6V</span>
                    </div>
                  </div>
                );
              } else if (i === 3) {
                return (
                  <div className="stat special" key={i}>
                    <div className="stat__k">
                      <img src={icon} className="icon icon-muted" alt={k} /> {k}
                    </div>
                    <div className="stat__v">{v}</div>
                    <div className="progress">
                      <div
                        className="progress__bar"
                        style={{ width: `${Number(selectedData?.phoneBatterySOC ?? 0)}%` }}
                      />
                    </div>
                    <div className="row">
                      <span className="u-strong">{selectedData?.phoneBatterySOC ?? "-"}</span>
                      <span className="u-muted">{phoneVolt} / 4.2V</span>
                    </div>
                  </div>
                );
              }

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
          <div className="subpanel">
            <h3 className="subpanel__title"><img src="/icon/컨트롤박스.png" className="iconh3 icon-text" alt="컨트롤박스"/> 컨트롤박스</h3>
            <div className="pad__labels">
              <span className="chip chip--ghost">CID001</span>
              <span className="chip chip--ghost">CID002</span>
            </div>
            <div className="pad">
              <ControlPanel />
            </div>
          </div>
        </section>
      </div>
    
  );
}
