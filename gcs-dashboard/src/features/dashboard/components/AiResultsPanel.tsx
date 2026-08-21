import type { ReactNode } from "react";
import type { DashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";

export interface AiDetectionSummary {
  readonly confidence: number;
  readonly label: string;
  readonly riskScore: number;
}

export interface AiAnalysisSummary {
  readonly detections: readonly AiDetectionSummary[];
  readonly generatedAt: string;
  readonly processingLatencyMs: number | null;
  readonly reportText: string;
  readonly riskScore: number;
}

interface AiResultsPanelProps {
  readonly analysis?: AiAnalysisSummary | null;
  readonly controls: ReactNode;
  readonly panelClassName: string;
  readonly widget: DashboardWidgetDefinition;
}

export function AiResultsPanel({ analysis = null, controls, panelClassName, widget }: AiResultsPanelProps) {
  return (
    <section aria-labelledby="ai-title" className={panelClassName} data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}>
      <div className="ops-panel__header">
        <h2 id="ai-title">AI 결과</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${analysis ? "is-online" : "is-offline"}`}>
            {analysis ? "수신" : "결과 없음"}
          </span>
          {controls}
        </span>
      </div>
      {analysis ? <AiAnalysisContent analysis={analysis} /> : (
        <p className="ai-panel__empty">검증된 AI metadata가 수신되면 탐지 결과를 표시합니다.</p>
      )}
    </section>
  );
}

function AiAnalysisContent({ analysis }: { readonly analysis: AiAnalysisSummary }) {
  return (
    <div className="ai-panel__content">
      <p>{analysis.reportText}</p>
      <dl>
        <div><dt>탐지</dt><dd>{analysis.detections.length}건</dd></div>
        <div><dt>위험도</dt><dd>{Math.round(analysis.riskScore * 100)}%</dd></div>
        <div><dt>처리 지연</dt><dd>{analysis.processingLatencyMs === null ? "미제공" : `${analysis.processingLatencyMs} ms`}</dd></div>
      </dl>
      <ul>
        {analysis.detections.map((detection, index) => (
          <li key={`${detection.label}-${index}`}>
            <strong>{detection.label}</strong>
            <span>신뢰도 {Math.round(detection.confidence * 100)}% · 위험도 {Math.round(detection.riskScore * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
