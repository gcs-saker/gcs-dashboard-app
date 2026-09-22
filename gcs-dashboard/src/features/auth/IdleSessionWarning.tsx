import "./IdleSessionWarning.css";

interface IdleSessionWarningProps {
  onExtend: () => void;
  seconds: number;
}

export function IdleSessionWarning({ onExtend, seconds }: IdleSessionWarningProps) {
  return (
    <aside className="idle-session-warning" role="alertdialog" aria-label="세션 만료 경고" aria-live="assertive">
      <span>활동이 없어 {seconds}초 후 로그아웃됩니다.</span>
      <button type="button" onClick={onExtend}>세션 연장</button>
    </aside>
  );
}
