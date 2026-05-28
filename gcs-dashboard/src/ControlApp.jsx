import React, { useEffect, useState } from "react";
import "./gcs.scss";
import MenuPanel from "./component/MenuPanel";
import ControlMainBodyPanel from "./component/ControlMainBodyPanel";
import CCTVMainBodyPanel from "./component/CCTVMainBodyPanel";
import TelemetryDashboard from "./component/TelemetryDashboard";
import { apiUrl } from "./config";
import { authenticatedFetch } from "./features/auth/authApi";

export default function GCSRoverUI() {
  const [telemetryMap, setTelemetryMap] = useState({});
  const [selectedUUID, setSelectedUUID] = useState("");
  // 비디오 정보 받아오기
  const [videoInfo, setVideoInfo] = useState({});

  // ✅ resolution state 선언
  const [resolution, setResolution] = useState(10); // 기본 8

  // ✅ UUID별 시계열 버퍼(차트용)
  const [seriesByUUID, setSeriesByUUID] = useState({}); // { [uuid]: Array<sample> }

  // 메뉴 버튼 변경
  const [menuIndex, setMenuIndex] = useState(0);

  // ✅ resolution을 width/height로 변환 (예시: 배율 계산)
  const width = resolution * 10;   // 8 → 640px
  const height = resolution * 10;  // 8 → 360px

  // selectedData 값 추출
  const selectedData = selectedUUID ? telemetryMap[selectedUUID] : undefined;

  // unmaned_assets 값 불러오기
  const [unmanedAssetMap, setUnmanedAssetMap] = useState({});
  const [unmanedAssetUUID, setUnmanedAssetUUID] = useState("");

  // 차트용 필드 매핑 (App의 데이터 → TelemetryDashboard 데이터 형식)
  const shapeForChart = (s) => {
    if (!s) return null;
    // epochTime이 초 단위일 수 있으므로 ms 보정
    const tsMs =
      typeof s.epochTime === 'number'
        ? (s.epochTime > 1e12 ? s.epochTime : s.epochTime * 1000)
        : Date.now();

    return {
      t: tsMs,
      alt: s.altitude ?? 0,                      // m
      mx: s.magneticX ?? (s.magnetic?.[0] ?? 0),// µT
      my: s.magneticY ?? (s.magnetic?.[1] ?? 0),
      mz: s.magneticZ ?? (s.magnetic?.[2] ?? 0),
      soc: typeof s.soc === 'string' ? parseFloat(s.soc) : (s.soc ?? 0), // %
      phoneBatterySOC: s.phoneBatterySOC ?? 0,   // %
      velocity: s.velocity ?? 0,                 // m/s
      totalDistance: s.totalDistance ?? 0,       // m
      portDistance: s.portDistance ?? 0,         // m (남은거리)
    };
  };

  // 첫 데이터가 들어오면 자동으로 UUID 선택
  useEffect(() => {
    if (!selectedUUID) {
      const first = Object.keys(telemetryMap)[0];
      if (first) setSelectedUUID(first);
    }

    const s = telemetryMap[selectedUUID];
    if (!s) return;
    
    const shaped = shapeForChart(s);
    if (!shaped) return;

    setSeriesByUUID((prev) => {
      const prevArr = prev[selectedUUID] || [];
      const last = prevArr[prevArr.length - 1];
      // 같은 타임스탬프면 중복 입력 방지
      if (last && last.t === shaped.t) return prev;

      const nextArr = [...prevArr.slice(-299), shaped]; // 최근 300개 유지
      return { ...prev, [selectedUUID]: nextArr };
    });

    // 예시: 새 UUID가 선택될 때마다 gateway API 요청
    authenticatedFetch(apiUrl(`/asset/${selectedUUID}`))
      .then(res => res.json())
      .then(data => {
        // 배열 → uuid 기준으로 Map 형태 변환
        const map = {};
        data.forEach(asset => {
          map[asset.uuid] = asset;
        });
        console.log(map)
        setUnmanedAssetMap(map);
      })
      .catch(err => console.error("❌ Unmaned_assets 요청 실패:", err));

  }, [telemetryMap, selectedUUID]);

  // 전압 계산
  const roverVolt =
    selectedData?.soc != null
      ? (Number(selectedData.soc) / 100 * 12.6).toFixed(2)
      : "-";
  const phoneVolt =
    selectedData?.phoneBatterySOC != null
      ? (Number(selectedData.phoneBatterySOC) / 100 * 4.2).toFixed(2)
      : "-";

  // 메뉴바 버튼 제어 이벤트 
  const controlButtonClick = () => { setMenuIndex(0); };
  const cctvButtonClick = () => { setMenuIndex(1); };
  const staticButtonClick = () => { setMenuIndex(2); };
  const routeButtonClick = () => { setMenuIndex(3); };
  

  // ✅ 슬라이드 값 바뀔 때 호출
  const handleResolutionChange = (e) => {
    setResolution(Number(e.target.value)); // 새로운 값으로 업데이트
  };
  
  // 메뉴 함수식
  let menuFX;
  if (menuIndex === 0) {
    menuFX = (
      <ControlMainBodyPanel
        telemetryMap={telemetryMap}
        setTelemetryMap={setTelemetryMap}
        selectedUUID={selectedUUID}
        selectedData={selectedData}
        resolution={resolution}
        unmanedAssetMap={unmanedAssetMap}
        handleResolutionChange={handleResolutionChange}
        videoInfo={videoInfo}
        setVideoInfo={setVideoInfo}
        roverVolt={roverVolt}
        phoneVolt={phoneVolt}
        width={width}
        height={height}
      />
    )
  } else if (menuIndex === 1) {
    menuFX = (
      <CCTVMainBodyPanel
        telemetryMap={telemetryMap}
        setTelemetryMap={setTelemetryMap}
        selectedUUID={selectedUUID}
        selectedData={selectedData}
        resolution={resolution}
        handleResolutionChange={handleResolutionChange}
        videoInfo={videoInfo}
        setVideoInfo={setVideoInfo}
        width={width}
        height={height}
      />
    )
  } else if (menuIndex === 2) {
    menuFX = (
      <TelemetryDashboard data={seriesByUUID[selectedUUID]} />
    )
  }
  
  return (
    <div className="gcs-app">
      {/* ===== Menu Grid ===== */}
      <MenuPanel
        telemetryMap={telemetryMap}
        selectedUUID={selectedUUID}
        setSelectedUUID={setSelectedUUID}
        selectedData={selectedData}
        controlButtonClick={controlButtonClick}
        cctvButtonClick={cctvButtonClick} 
        routeButtonClick={routeButtonClick} 
        staticButtonClick={staticButtonClick}
        menuIndex={menuIndex}
      />
      {/* ===== Main Grid ===== */}
      {menuFX}
    </div>
  );
}
