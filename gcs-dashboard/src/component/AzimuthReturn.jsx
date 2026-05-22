function calculateHeading(mx, my) {
  // 1. 라디안 각도
  let heading = Math.atan2(my, mx) * (180 / Math.PI);

  // 2. 범위 보정
  if (heading < 0) {
    heading += 360;
  }

  return heading; // 0 ~ 360도
}

function headingToDirection(angle) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(angle / 45) % 8;
  return dirs[idx];
}

export default function AzimuthReturn({ mx=-30, my=20 }) {
  // 사용 예시
  const heading = calculateHeading(mx, my);   // 예: 325도
  const dir = headingToDirection(heading);    // "NW"

  return `${heading.toFixed(0)}° ${dir}`;
}
