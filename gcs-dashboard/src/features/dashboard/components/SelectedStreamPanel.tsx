import type { ReactNode } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  SELECTED_STREAM_WIDGET,
} from "../streamTypes";

interface SelectedStreamPanelProps {
  stream: DashboardStreamSlot;
  controls?: ReactNode;
}

export function SelectedStreamPanel({ stream, controls }: SelectedStreamPanelProps) {
  return (
    <section
      aria-labelledby="selected-stream-title"
      className="ops-panel selected-stream"
      data-widget-id={SELECTED_STREAM_WIDGET.id}
      style={{ minHeight: SELECTED_STREAM_WIDGET.minHeight }}
    >
      <div className="ops-panel__header">
        <h2 id="selected-stream-title">선택 스트림</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>
            {getDashboardStreamStatusText(stream.status)}
          </span>
          {controls}
        </span>
      </div>
      <div className={`selected-stream__viewport mode-${stream.mode.toLowerCase()}`}>
        <div className="reticle" />
        <div className="selected-stream__meta">
          <strong>{stream.title}</strong>
          <span>{stream.detail}</span>
        </div>
      </div>
    </section>
  );
}
