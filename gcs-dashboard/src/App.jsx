import { useEffect, useState } from 'react';
import './App.scss';
import MainMap from './component/MainMap';
import HLSPlayer from './component/HLSPlayer';
import ControlPanel from './component/ControlPanel';
import TelemetryDashboard from './component/TelemetryDashboard';
import { StreamingSmokeDashboard } from './features/streaming/components/StreamingSmokeDashboard';

function App() {
  if (new URLSearchParams(window.location.search).get('streamingSmoke') === '1') {
    return <StreamingSmokeDashboard />;
  }

  const [telemetryMap, setTelemetryMap] = useState({});
  const [selectedUUID, setSelectedUUID] = useState('');

  // ✅ UUID별 시계열 버퍼(차트용)
  const [seriesByUUID, setSeriesByUUID] = useState({}); // { [uuid]: Array<sample> }

  // 선택된 UUID의 “현재 샘플”(마지막 값) — 기존 UI용
  const selectedData = telemetryMap[selectedUUID];

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

  // telemetryMap이 갱신될 때, 선택된 UUID의 샘플을 시계열 버퍼에 누적
  useEffect(() => {
    if (!selectedUUID) return;
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
  }, [telemetryMap, selectedUUID]);

  return (
    <div className="responsive-box">
      <div className="dashboard">
        <div className="topbar">🛰 GCS SAKER - (주)A4AI </div>

        <div className="main-content">
          {/* Left - MAP */}
          <div className="left-panel">
            {/* setTelemetryMap은 그대로 사용 */}
            <MainMap setTelemetryMap={setTelemetryMap}/>
          </div>

          {/* Right - VIDEO + ALERT */}
          <div className="right-panel">
            <div className="video-stream">
              <HLSPlayer />
            </div>
            <div className="alert-list">
              <ControlPanel />
            </div>
          </div>
        </div>

        {/* Footer – 선택 노드 정보 + 차트 */}
        <div className="data-panel">
          <div style={{ marginBottom: '5px' }}>
            <label>노드 선택: </label>
            <select value={selectedUUID} onChange={(e) => setSelectedUUID(e.target.value)}>
              <option value="">-- 노드 선택 --</option>
              {Object.keys(telemetryMap).map((uuid) => (
                <option key={uuid} value={uuid}>{uuid}</option>
              ))}
            </select>
          </div>

          {selectedUUID && selectedData ? (
            <>
              ✅ <b>{selectedUUID}</b> 정보 :
              위도: {selectedData.latitude?.toFixed?.(5) ?? '-'} /
              경도: {selectedData.longitude?.toFixed?.(5) ?? '-'} /
              고도: {selectedData.altitude?.toFixed?.(1) ?? '-'} m /
              지자계: X={selectedData.magneticX?.toFixed?.(1) ?? '-'},
              Y={selectedData.magneticY?.toFixed?.(1) ?? '-'},
              Z={selectedData.magneticZ?.toFixed?.(1) ?? '-'} /
              무인체 배터리 : {selectedData.soc ?? '-'} % /
              스마트폰 배터리 : {selectedData.phoneBatterySOC ?? '-'} % /
              속도 : {selectedData.velocity?.toFixed?.(2) ?? '-'} m/s /
              주행거리 : {selectedData.totalDistance?.toFixed?.(2) ?? '-'} m /
              {/* epochTime은 s일 수 있어 toFixed(2) 대신 정수/시간 포맷 권장 */}
              주행시간 : {selectedData.epochTime ?? '-'} s /
              충전소거리 : {selectedData.portDistance?.toFixed?.(2) ?? '-'} m
            </>
          ) : (
            <>노드를 선택하면 위치 정보가 표시됩니다.</>
          )}
        </div>

        {/* ✅ 차트 패널: 선택된 UUID의 시계열을 바로 바인딩 */}
        <div className="chart-panel" style={{ padding: '12px' }}>
          <TelemetryDashboard data={seriesByUUID[selectedUUID]} />
          {/* data가 없으면 컴포넌트가 데모 모드로 동작합니다. */}
        </div>
      </div>
    </div>
  );
}

export default App;
