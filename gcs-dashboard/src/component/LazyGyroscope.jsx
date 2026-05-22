import React, { lazy, Suspense } from "react";

const Gyroscope = lazy(() => import("./Gyroscope"));

export default function LazyGyroscope(props) {
  return (
    <Suspense fallback={<div className="gyro-fallback" aria-label="지자계 로딩" />}>
      <Gyroscope {...props} />
    </Suspense>
  );
}
