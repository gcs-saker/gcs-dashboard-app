// src/component/Magnetometer/Gyroscope.js
import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

// 축 색상: 주(오렌지), 노(옐로), 시안
const COLOR_X = "#ff8a3d"; // 주
const COLOR_Y = "#ffd400"; // 노
const COLOR_Z = "#00d1ff"; // 시안
const COLOR_VEC = "#ff5533"; // 측정 벡터(빨강 톤)

function Legend() {
  const item = (label, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        top: 8,
        display: "flex",
        gap: 12,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.4)",
        color: "#e7ebf3",
        fontSize: 12,
        borderRadius: 8,
        pointerEvents: "none",
      }}
    >
      {item("X", COLOR_X)}
      {item("Y", COLOR_Y)}
      {item("Z", COLOR_Z)}
    </div>
  );
}

/** 굵은 화살표 메쉬 (원통+콘) */
function ThickArrow({
  dir = new THREE.Vector3(1, 0, 0),
  length = 1,
  color = "#ff5533",
}) {
  const shaftLen = Math.max(0.2, length * 0.75);
  const headLen = Math.max(0.15, length * 0.25);
  const shaftRadius = 0.05;
  const headRadius = 0.1;

  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    const base = new THREE.Vector3(0, 1, 0); // +Y 기준
    const d = dir.clone().normalize();
    if (d.lengthSq() > 0) q.setFromUnitVectors(base, d);
    return q;
  }, [dir]);

  return (
    <group quaternion={quat}>
      <mesh position={[0, shaftLen / 2, 0]}>
        <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLen, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, shaftLen + headLen / 2, 0]}>
        <coneGeometry args={[headRadius, headLen, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/** 지자계 뷰 (구 내부에 벡터 + XYZ 축 화살표) */
function GyroContent({ mx = 0, my = 0, mz = 0 }) {
  const R = 1.0; // 구 반지름

  // 측정 벡터 계산
  const v = useMemo(() => new THREE.Vector3(mx, my, mz), [mx, my, mz]);
  const len = v.length();
  const dir = len > 0 ? v.clone().normalize() : new THREE.Vector3(1, 0, 0);

  // 스케일 + 클램프(구 내부)
  const scale = 0.05;
  const vecLen = Math.min(len * scale, R * 0.9);

  // XYZ 축 화살표 길이
  const axisLen = R * 0.95;

  return (
    <>
      {/* 와이어 구 */}
      <mesh>
        <sphereGeometry args={[R, 32, 32]} />
        <meshBasicMaterial wireframe />
      </mesh>

      {/* XYZ 축: 굵은 화살표 (주/노/시안) */}
      <ThickArrow dir={new THREE.Vector3(1, 0, 0)} length={axisLen} color={COLOR_X} />
      <ThickArrow dir={new THREE.Vector3(0, 1, 0)} length={axisLen} color={COLOR_Y} />
      <ThickArrow dir={new THREE.Vector3(0, 0, 1)} length={axisLen} color={COLOR_Z} />

      {/* 측정된 지자계 벡터(빨강) */}
      <ThickArrow dir={dir} length={vecLen} color={COLOR_VEC} />
    </>
  );
}

export default function Gyroscope({
  mx = 0,
  my = 0,
  mz = 0,
  size = 220,
  style = {},
  className = "",
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        zIndex: 20,
        overflow: "hidden",
        pointerEvents: "none",
        borderRadius: 12,
        ...style,
      }}
    >
      <Legend />
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)} // 투명 배경
      >
        <ambientLight />
        <GyroContent mx={mx} my={my} mz={mz} />
      </Canvas>
    </div>
  );
}
