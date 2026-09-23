export interface MotionAxes {
  forward: number;
  right: number;
  up: number;
  yaw: number;
}

export type ControlIntent = { type: "motion"; axes: MotionAxes } | { type: "stop" };
