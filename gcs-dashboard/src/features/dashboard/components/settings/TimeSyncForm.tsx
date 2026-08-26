import type { FormEvent } from "react";
import { timeSyncModeLabel, type TimeSyncConfigInput, type TimeSyncMode } from "@dashboard/operations/timeSync";

interface TimeSyncFormProps {
  form: TimeSyncConfigInput;
  isLoading: boolean;
  isSaving: boolean;
  onChangeForm: (form: TimeSyncConfigInput) => void;
  onRefresh: () => void;
  onRunCheck: () => void;
  onSubmit: () => void;
}

export function TimeSyncForm({ form, isLoading, isSaving, onChangeForm, onRefresh, onRunCheck, onSubmit }: TimeSyncFormProps) {
  const isManual = form.mode === "manual";
  const disabled = isSaving || isLoading;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit();
  };
  const updateMode = (mode: TimeSyncMode): void => {
    onChangeForm({
      ...form,
      mode,
      sourceHost: mode === "public" && !form.sourceHost ? "pool.ntp.org" : mode === "manual" ? "" : form.sourceHost,
    });
  };

  return (
    <form className="time-sync-view__form" onSubmit={submit}>
      <fieldset>
        <legend>망 유형</legend>
        {(["public", "closed_network", "manual"] as TimeSyncMode[]).map((mode) => (
          <button aria-pressed={form.mode === mode} className={form.mode === mode ? "is-active" : ""} key={mode} onClick={() => updateMode(mode)} type="button">
            {timeSyncModeLabel(mode)}
          </button>
        ))}
      </fieldset>
      <label>
        <span>시간 서버</span>
        <input disabled={isManual} onChange={(event) => onChangeForm({ ...form, sourceHost: event.target.value })} placeholder={form.mode === "closed_network" ? "10.0.0.10 또는 ntp.local" : "pool.ntp.org"} value={form.sourceHost} />
      </label>
      <label>
        <span>포트</span>
        <input disabled={isManual} min={1} max={65535} onChange={(event) => onChangeForm({ ...form, sourcePort: Number(event.target.value) })} type="number" value={form.sourcePort} />
      </label>
      <label>
        <span>Drift 경고</span>
        <input min={1} max={600000} onChange={(event) => onChangeForm({ ...form, driftWarnMs: Number(event.target.value) })} type="number" value={form.driftWarnMs} />
      </label>
      <div className="time-sync-view__commands">
        <button disabled={disabled} type="submit">설정 저장</button>
        <button disabled={disabled} onClick={onRunCheck} type="button">동기화 점검</button>
        <button className="ops-command-button settings-refresh-button" disabled={disabled}
          onClick={onRefresh} type="button">새로고침</button>
      </div>
    </form>
  );
}
