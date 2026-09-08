import type { ReactNode } from "react";
import type { SystemStatusRow } from "@dashboard/operations/systemStatusViewModel";

interface SystemStatusPrimaryPanelProps {
  checkedText: string;
  controls?: ReactNode;
  rows: SystemStatusRow[];
  variant: "panel" | "page";
}

export function SystemStatusPrimaryPanel({ checkedText, controls, rows, variant }: SystemStatusPrimaryPanelProps) {
  return (
    <section className={variant === "page" ? "ops-panel system-status-page__panel" : undefined}>
      <div className="ops-panel__header">
        <h2 id="status-title">서버 상태 상세 / 연결상태 / 헬스체크</h2>
        {controls}
      </div>
      <dl>
        {rows.map(([label, value, rowStatus]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><span aria-hidden="true" className={`status-dot is-${rowStatus}`} />{value}</dd>
          </div>
        ))}
      </dl>
      <p className="system-status__updated">업데이트 {checkedText}</p>
    </section>
  );
}
