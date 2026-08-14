import type { ReactNode } from "react";
import type { DashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";

interface AiResultsPanelProps {
  controls: ReactNode;
  panelClassName: string;
  widget: DashboardWidgetDefinition;
}

export function AiResultsPanel({ controls, panelClassName, widget }: AiResultsPanelProps) {
  return (
    <section
      aria-labelledby="ai-title"
      className={panelClassName}
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="ai-title">AI 결과</h2>
        <span className="ops-panel__header-actions">
          <span className="ops-badge is-warning">대기</span>
          {controls}
        </span>
      </div>
      <ul>
        <li>
          <strong>탐지</strong>
          <span>person / 0.72</span>
        </li>
        <li>
          <strong>위험도</strong>
          <span>중간</span>
        </li>
        <li>
          <strong>처리 지연</strong>
          <span>42 ms</span>
        </li>
      </ul>
    </section>
  );
}
