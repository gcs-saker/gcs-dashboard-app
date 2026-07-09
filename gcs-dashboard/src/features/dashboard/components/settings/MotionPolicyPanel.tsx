import {
  MOTION_MODE_DESCRIPTIONS,
  MOTION_MODE_LABELS,
  MOTION_MODES,
  type MotionMode,
} from "@dashboard/motionPreference";

interface MotionPolicyPanelProps {
  motionMode: MotionMode;
  onMotionModeChange?: (mode: MotionMode) => void;
}

export function MotionPolicyPanel({ motionMode, onMotionModeChange }: MotionPolicyPanelProps) {
  return (
    <section className="time-sync-view__policy motion-settings" aria-label="화면 효과 정책">
      <header className="time-sync-view__policy-header">
        <div>
          <span>전역 Motion Policy</span>
          <strong>{MOTION_MODE_LABELS[motionMode]}</strong>
        </div>
        <em>즉시 반영</em>
      </header>
      <div className="motion-settings__choices" role="radiogroup" aria-label="화면 효과 모드">
        {MOTION_MODES.map((mode) => (
          <button aria-checked={motionMode === mode} className={motionMode === mode ? "is-active" : ""} key={mode} onClick={() => onMotionModeChange?.(mode)} role="radio" type="button">
            <span>{MOTION_MODE_LABELS[mode]}</span>
            <strong>{mode}</strong>
            <em>{MOTION_MODE_DESCRIPTIONS[mode]}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
