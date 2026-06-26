export type MotionMode = "full" | "reduced" | "off";

export const MOTION_MODES: readonly MotionMode[] = Object.freeze(["full", "reduced", "off"]);

export const MOTION_MODE_LABELS: Readonly<Record<MotionMode, string>> = Object.freeze({
  full: "전체 효과",
  off: "효과 끄기",
  reduced: "효과 줄임",
});

export const MOTION_MODE_DESCRIPTIONS: Readonly<Record<MotionMode, string>> = Object.freeze({
  full: "일반 transition, glow, pulse, chart animation을 허용합니다.",
  off: "시각 animation과 transition을 정지하고 정적 상태 신호만 유지합니다.",
  reduced: "운영 피로도를 줄이기 위해 필수 transition만 짧게 유지합니다.",
});

export function normalizeMotionMode(value: unknown, fallback: MotionMode = detectPreferredMotionMode()): MotionMode {
  return typeof value === "string" && isMotionMode(value) ? value : fallback;
}

export function detectPreferredMotionMode(): MotionMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "full";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
}

export function isMotionEnabled(mode: MotionMode): boolean {
  return mode !== "off";
}

function isMotionMode(value: string): value is MotionMode {
  return MOTION_MODES.includes(value as MotionMode);
}
