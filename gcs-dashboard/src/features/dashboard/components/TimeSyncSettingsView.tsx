import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTimeSyncStatus } from "../hooks/useTimeSyncStatus";
import {
  calculateBrowserOffsetMs,
  timeSyncHealthLabel,
  timeSyncModeLabel,
  type TimeSyncConfigInput,
  type TimeSyncMode,
} from "../timeSync";

const defaultForm: TimeSyncConfigInput = {
  mode: "public",
  sourceHost: "pool.ntp.org",
  sourcePort: 123,
  driftWarnMs: 1_000,
};

export function TimeSyncSettingsView() {
  const { errorMessage, isLoading, isSaving, lastUpdatedAt, refresh, runCheck, save, status } = useTimeSyncStatus();
  const [form, setForm] = useState<TimeSyncConfigInput>(defaultForm);

  useEffect(() => {
    if (!status) return;
    setForm({
      mode: status.mode,
      sourceHost: status.sourceHost ?? "",
      sourcePort: status.sourcePort,
      driftWarnMs: status.driftWarnMs,
    });
  }, [status]);

  const browserOffsetMs = useMemo(() => (status ? calculateBrowserOffsetMs(status) : 0), [status]);
  const isManual = form.mode === "manual";

  const updateMode = (mode: TimeSyncMode): void => {
    setForm((current) => ({
      ...current,
      mode,
      sourceHost: mode === "public" && !current.sourceHost ? "pool.ntp.org" : mode === "manual" ? "" : current.sourceHost,
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void save(form);
  };

  return (
    <section className="time-sync-view" aria-label="시간 동기화 설정">
      <div className="time-sync-view__header">
        <div>
          <h2>시간 동기화</h2>
          {status ? <p>{status.message}</p> : <p>시간 상태 확인 중</p>}
        </div>
        <span className={`time-sync-view__health is-${status?.health ?? "warn"}`} role="status">
          {status ? timeSyncHealthLabel(status.health) : "확인 중"}
        </span>
      </div>

      <div className="time-sync-view__metrics" aria-label="시간 상태">
        <span>
          <strong>서버시각</strong>
          {status ? new Date(status.serverTime).toLocaleString("ko-KR") : "-"}
        </span>
        <span>
          <strong>브라우저차이</strong>
          {status ? `${Math.round(browserOffsetMs)} ms` : "-"}
        </span>
        <span>
          <strong>시간소스</strong>
          {status?.sourceHost ? `${status.sourceHost}:${status.sourcePort}` : "없음"}
        </span>
        <span>
          <strong>기준</strong>
          {status ? `${status.timezone} / ${status.monotonicMs} ms` : "-"}
        </span>
        <span>
          <strong>갱신</strong>
          {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("ko-KR") : "-"}
        </span>
      </div>

      <form className="time-sync-view__form" onSubmit={submit}>
        <fieldset>
          <legend>망 유형</legend>
          {(["public", "closed_network", "manual"] as TimeSyncMode[]).map((mode) => (
            <button
              aria-pressed={form.mode === mode}
              className={form.mode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => updateMode(mode)}
              type="button"
            >
              {timeSyncModeLabel(mode)}
            </button>
          ))}
        </fieldset>

        <label>
          <span>시간 서버</span>
          <input
            disabled={isManual}
            onChange={(event) => setForm((current) => ({ ...current, sourceHost: event.target.value }))}
            placeholder={form.mode === "closed_network" ? "10.0.0.10 또는 ntp.local" : "pool.ntp.org"}
            value={form.sourceHost}
          />
        </label>

        <label>
          <span>포트</span>
          <input
            disabled={isManual}
            min={1}
            max={65535}
            onChange={(event) => setForm((current) => ({ ...current, sourcePort: Number(event.target.value) }))}
            type="number"
            value={form.sourcePort}
          />
        </label>

        <label>
          <span>Drift 경고</span>
          <input
            min={1}
            max={600000}
            onChange={(event) => setForm((current) => ({ ...current, driftWarnMs: Number(event.target.value) }))}
            type="number"
            value={form.driftWarnMs}
          />
        </label>

        <div className="time-sync-view__commands">
          <button disabled={isSaving || isLoading} type="submit">
            설정 저장
          </button>
          <button disabled={isSaving || isLoading} onClick={() => void runCheck()} type="button">
            동기화 점검
          </button>
          <button disabled={isSaving || isLoading} onClick={() => void refresh()} type="button">
            새로고침
          </button>
        </div>
      </form>

      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
