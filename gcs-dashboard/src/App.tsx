import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.scss";
import MainMap from "./component/MainMap";
import HLSPlayer from "./component/HLSPlayer";
import ControlPanel from "./component/ControlPanel";
import TelemetryDashboard from "./component/TelemetryDashboard";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { StreamingSmokeDashboard } from "./features/streaming/components/StreamingSmokeDashboard";

interface TelemetrySample {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  magneticX?: number;
  magneticY?: number;
  magneticZ?: number;
  magnetic?: number[];
  soc?: number | string;
  phoneBatterySOC?: number;
  velocity?: number;
  totalDistance?: number;
  epochTime?: number | string;
  portDistance?: number;
}

interface ChartSample {
  t: number;
  alt: number;
  mx: number;
  my: number;
  mz: number;
  soc: number;
  phoneBatterySOC: number;
  velocity: number;
  totalDistance: number;
  portDistance: number;
}

type TelemetryMap = Record<string, TelemetrySample>;
type SeriesByUUID = Record<string, ChartSample[]>;

function DashboardShell() {
  const [telemetryMap, setTelemetryMap] = useState<TelemetryMap>({});
  const [selectedUUID, setSelectedUUID] = useState("");
  const [seriesByUUID, setSeriesByUUID] = useState<SeriesByUUID>({});

  const selectedData = telemetryMap[selectedUUID];

  const shapeForChart = (sample: TelemetrySample | undefined): ChartSample | null => {
    if (!sample) return null;
    const tsMs =
      typeof sample.epochTime === "number"
        ? sample.epochTime > 1e12
          ? sample.epochTime
          : sample.epochTime * 1000
        : Date.now();

    return {
      t: tsMs,
      alt: sample.altitude ?? 0,
      mx: sample.magneticX ?? sample.magnetic?.[0] ?? 0,
      my: sample.magneticY ?? sample.magnetic?.[1] ?? 0,
      mz: sample.magneticZ ?? sample.magnetic?.[2] ?? 0,
      soc: typeof sample.soc === "string" ? Number.parseFloat(sample.soc) : sample.soc ?? 0,
      phoneBatterySOC: sample.phoneBatterySOC ?? 0,
      velocity: sample.velocity ?? 0,
      totalDistance: sample.totalDistance ?? 0,
      portDistance: sample.portDistance ?? 0,
    };
  };

  useEffect(() => {
    if (!selectedUUID) return;
    const sample = telemetryMap[selectedUUID];
    const shaped = shapeForChart(sample);
    if (!shaped) return;

    setSeriesByUUID((prev) => {
      const prevArr = prev[selectedUUID] || [];
      const last = prevArr[prevArr.length - 1];
      if (last && last.t === shaped.t) return prev;

      const nextArr = [...prevArr.slice(-299), shaped];
      return { ...prev, [selectedUUID]: nextArr };
    });
  }, [telemetryMap, selectedUUID]);

  return (
    <div className="responsive-box">
      <div className="dashboard">
        <div className="topbar">GCS SAKER - (주)A4AI</div>

        <div className="main-content">
          <div className="left-panel">
            <MainMap setTelemetryMap={setTelemetryMap} />
          </div>

          <div className="right-panel">
            <div className="video-stream">
              <HLSPlayer onVideoInfo={() => undefined} />
            </div>
            <div className="alert-list">
              <ControlPanel />
            </div>
          </div>
        </div>

        <div className="data-panel">
          <div style={{ marginBottom: "5px" }}>
            <label>노드 선택: </label>
            <select value={selectedUUID} onChange={(event) => setSelectedUUID(event.target.value)}>
              <option value="">-- 노드 선택 --</option>
              {Object.keys(telemetryMap).map((uuid) => (
                <option key={uuid} value={uuid}>
                  {uuid}
                </option>
              ))}
            </select>
          </div>

          {selectedUUID && selectedData ? (
            <>
              <b>{selectedUUID}</b> 정보 : 위도: {selectedData.latitude?.toFixed?.(5) ?? "-"} /
              경도: {selectedData.longitude?.toFixed?.(5) ?? "-"} / 고도:{" "}
              {selectedData.altitude?.toFixed?.(1) ?? "-"} m / 지자계: X=
              {selectedData.magneticX?.toFixed?.(1) ?? "-"}, Y=
              {selectedData.magneticY?.toFixed?.(1) ?? "-"}, Z=
              {selectedData.magneticZ?.toFixed?.(1) ?? "-"} / 무인체 배터리 :{" "}
              {selectedData.soc ?? "-"} % / 스마트폰 배터리 :{" "}
              {selectedData.phoneBatterySOC ?? "-"} % / 속도 :{" "}
              {selectedData.velocity?.toFixed?.(2) ?? "-"} m/s / 주행거리 :{" "}
              {selectedData.totalDistance?.toFixed?.(2) ?? "-"} m / 주행시간 :{" "}
              {selectedData.epochTime ?? "-"} s / 충전소거리 :{" "}
              {selectedData.portDistance?.toFixed?.(2) ?? "-"} m
            </>
          ) : (
            <>노드를 선택하면 위치 정보가 표시됩니다.</>
          )}
        </div>

        <div className="chart-panel" style={{ padding: "12px" }}>
          <TelemetryDashboard data={seriesByUUID[selectedUUID]} />
        </div>
      </div>
    </div>
  );
}

function App() {
  if (new URLSearchParams(window.location.search).get("streamingSmoke") === "1") {
    return <StreamingSmokeDashboard />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <RequireAuth>
                <DashboardShell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
