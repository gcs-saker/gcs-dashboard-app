import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import "../telemetry.scss";   // ✅ CSS 분리
import "../gcs.scss";

// ======= Helper utils =======
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("ko-KR", {
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ======= Reusable Card =======
const Card = ({ title, subtitle, children }) => (
  <div className="card">
    <div className="card-header">
      <div>
        <div className="subtitle">{subtitle}</div>
        <div className="title">{title}</div>
      </div>
    </div>
    <div className="card-body">{children}</div>
  </div>
);

// ======= Gauge (Radial) =======
function Gauge({ value = 0, max = 100, unit = "%", label = "", height = 200 }) {
  const data = [
    { name: label || unit, value: clamp(value, 0, max), fill: "#60a5fa" },
  ];
  return (
    <div className="gauge-wrapper" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="90%"
          data={data}
          startAngle={220}
          endAngle={-40}
        >
          <PolarAngleAxis type="number" domain={[0, max]} tick={false} />
          <RadialBar minAngle={15} background clockWise dataKey="value" cornerRadius={12} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="gauge-text">
        <div className="gauge-label">{label}</div>
        <div className="gauge-value">
          {Math.round(value)}
          <span className="gauge-unit">{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ======= Speedometer (semi-circle gauge) =======
function Speedometer({ mps = 0, vmax = 50 }) {
  const kmh = mps * 3.6;
  const data = [
    { name: "속도", value: clamp(kmh, 0, vmax * 3.6), fill: "#34d399" },
  ];
  return (
    <div className="speedometer">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          startAngle={180}
          endAngle={0}
          innerRadius="70%"
          outerRadius="100%"
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, vmax * 3.6]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={12} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="speed-text">
        <div className="label">SPEED</div>
        <div className="value">{Math.round(kmh)}</div>
        <div className="unit">km/h</div>
      </div>
    </div>
  );
}

// ======= Main Component =======
export default function TelemetryDashboard({ data: propData }) {
  const [data, setData] = useState(propData || []);

  const last = data[data.length - 1] || {};
  const vmaxMps = 30;

  // 거리 시리즈 (누적 / 충전소까지)
  const distanceSeries = useMemo(
    () =>
      data.map((d) => ({
        t: d.t,
        total: d.totalDistance,
        toPort: d.portDistance,
      })),
    [data]
  );

  // 거리 Y축 최대값
  const distMax = Math.max(
    1000,
    (last.totalDistance || 0) + (last.portDistance || 0) + 1
  );

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">
      <img src="/icon/통계.png"  className="icon icon-muted" alt="통계"/>  
        텔레메트리 대시보드
      </h1>
      <div className="grid-2x3">
        {/* 고도 */}
        <Card title="고도 (Altitude)" subtitle="m">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={24} />
              <YAxis width={40} />
              <Tooltip labelFormatter={(v) => fmtTime(v)} formatter={(v) => [v, "m"]} />
              <Area type="monotone" dataKey="alt" stroke="#6366f1" fill="#c7d2fe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* 지자계 */}
        <Card title="지자계 (Magnetic Field)" subtitle="µT (X/Y/Z)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={24} />
              <YAxis width={40} />
              <Tooltip labelFormatter={(v) => fmtTime(v)} />
              <Legend />
              <Line dataKey="mx" name="X" stroke="#ef4444" dot={false} />
              <Line dataKey="my" name="Y" stroke="#10b981" dot={false} />
              <Line dataKey="mz" name="Z" stroke="#3b82f6" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* 속도계 */}
        <Card title="속도계" subtitle="km/h">
          <Speedometer mps={last.velocity || 0} vmax={vmaxMps} />
        </Card>

        {/* 차량 배터리 */}
        <Card title="차량 배터리 SoC" subtitle="%">
          <Gauge value={last.soc ?? 0} label="Vehicle" />
        </Card>

        {/* 폰 배터리 */}
        <Card title="폰 배터리 SoC" subtitle="%">
          <Gauge value={last.phoneBatterySOC ?? 0} label="Phone" />
        </Card>

        {/* Distances Line Chart */} 
        <div className="w-full h-full p-4">
          <Card title="거리 (누적 / 충전소까지)" subtitle="m">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={distanceSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={24} />
                <YAxis domain={[0, distMax]} width={44} />
                <Tooltip labelFormatter={(v) => fmtTime(v)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="누적 주행거리"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="toPort"
                  name="충전소까지"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </div>
  );
}
