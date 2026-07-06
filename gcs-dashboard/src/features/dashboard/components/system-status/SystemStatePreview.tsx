const STATE_PREVIEW_ITEMS = [
  ["정상", "is-online", "느린 녹색 테두리"],
  ["주의", "is-degraded", "노란 경고 강조"],
  ["불량", "is-error", "빨간 알림 강조"],
  ["미연결", "is-offline", "무채색 고정 상태"],
] as const;

export function SystemStatePreview() {
  return (
    <section className="system-status-page__state-preview" aria-label="상태 시안">
      {STATE_PREVIEW_ITEMS.map(([label, stateClass, description]) => (
        <article className={`system-state-sample ${stateClass}`} key={label}>
          <span aria-hidden="true" className={`status-dot ${stateClass}`} />
          <strong>{label}</strong>
          <em>{description}</em>
        </article>
      ))}
    </section>
  );
}
