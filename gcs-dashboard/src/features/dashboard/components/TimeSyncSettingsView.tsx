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

type SettingsTab = "time" | "streaming" | "security" | "map" | "account";

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "time", label: "시간 동기화" },
  { id: "streaming", label: "스트리밍" },
  { id: "security", label: "보안" },
  { id: "map", label: "지도" },
  { id: "account", label: "계정/권한" },
];

export function TimeSyncSettingsView() {
  const { errorMessage, isLoading, isSaving, lastUpdatedAt, refresh, runCheck, save, status } = useTimeSyncStatus();
  const [form, setForm] = useState<TimeSyncConfigInput>(defaultForm);
  const [activeTab, setActiveTab] = useState<SettingsTab>("time");

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
          <h2>운영설정</h2>
          {status ? <p>{status.message}</p> : <p>시간 상태 확인 중</p>}
        </div>
        <span className={`time-sync-view__health is-${status?.health ?? "warn"}`} role="status">
          {status ? timeSyncHealthLabel(status.health) : "확인 중"}
        </span>
      </div>

      <nav className="time-sync-view__tabs" aria-label="운영설정 탭">
        {settingsTabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "time" ? (
        <>
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
        </>
      ) : (
        <SettingsPolicyPanel tab={activeTab as Exclude<SettingsTab, "time">} />
      )}

      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}

function SettingsPolicyPanel({ tab }: { tab: Exclude<SettingsTab, "time"> }) {
  const policies = {
    streaming: [
      ["CCTV 기본", "4x4 / 저화질 preview"],
      ["선택 확대", "고화질 main stream"],
      ["Fallback", "WebRTC 실패 시 HLS 확인"],
      ["ICE", "자체 STUN/TURN 우선"],
    ],
    security: [
      ["세션", "HttpOnly refresh token"],
      ["접근", "허용 대역/권한 그룹"],
      ["감사", "인증/스트림 이벤트 기록"],
      ["보호", "CSRF / XSS 기본 정책"],
    ],
    map: [
      ["지도 소스", "공개망 위성 / 오프라인 타일"],
      ["기본 중심", "선택 스트림 GPS"],
      ["마커", "스트림/사용자 지정 핀"],
      ["축척", "500 m 기본"],
    ],
    account: [
      ["사용자", "닉네임 / 역할"],
      ["그룹", "상위/하위 조직 권한"],
      ["송출 계정", "장비별 최소 권한"],
      ["감사", "계정 변경 이력"],
    ],
  } satisfies Record<Exclude<SettingsTab, "time">, Array<[string, string]>>;

  return (
    <section className="time-sync-view__policy" aria-label="운영 정책">
      <header className="time-sync-view__policy-header">
        <div>
          <span>설정 묶음</span>
          <strong>{settingsTabTitle(tab)}</strong>
        </div>
        <button type="button">변경 요청</button>
      </header>
      {policies[tab].map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <em>현재 정책</em>
        </article>
      ))}
    </section>
  );
}

function settingsTabTitle(tab: Exclude<SettingsTab, "time">): string {
  if (tab === "streaming") return "스트리밍 수신/송출 정책";
  if (tab === "security") return "인증/인가 및 감사 정책";
  if (tab === "map") return "지도 소스 및 마커 정책";
  return "계정/조직 권한 정책";
}
