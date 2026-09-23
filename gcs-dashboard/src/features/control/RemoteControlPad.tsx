import { useDeadManControl, type ControlIntent } from "./useDeadManControl";

interface RemoteControlPadProps {
  enabled: boolean;
  onIntent: (intent: ControlIntent) => void;
}

export function RemoteControlPad({ enabled, onIntent }: RemoteControlPadProps) {
  const control = useDeadManControl(enabled, onIntent);
  const button = (key: string, label: string) => (
    <button type="button" disabled={!enabled} aria-label={label}
      onPointerDown={() => control.press(key)} onPointerUp={() => control.release(key)}
      onPointerCancel={control.stop} onPointerLeave={() => control.release(key)}>{key.toUpperCase()}</button>
  );
  return (
    <section aria-label="원격 조종" data-control-enabled={enabled}>
      <div>{button("w", "전진")}</div>
      <div>{button("a", "좌 이동")}{button("s", "후진")}{button("d", "우 이동")}</div>
      <button type="button" disabled={!enabled} onClick={control.stop}>정지</button>
    </section>
  );
}
