import type { DashboardWidgetDefinition } from "../dashboardLayout";

interface WidgetPopoutProps {
  widget: DashboardWidgetDefinition;
  onClose: () => void;
}

export function WidgetPopout({ widget, onClose }: WidgetPopoutProps) {
  return (
    <div className="widget-dialog__backdrop">
      <section aria-label={`${widget.title} 팝아웃`} aria-modal="true" className="widget-popout" role="dialog">
        <header className="widget-dialog__header">
          <h2>{widget.title}</h2>
          <button className="widget-icon-button" onClick={onClose} title="닫기" type="button">
            X
          </button>
        </header>
        <div className="widget-popout__body">
          <div className="widget-popout__preview" aria-label={`${widget.title} 위젯 미리보기`}>
            <strong>{widget.title}</strong>
            <span>현재 대시보드 위젯과 동기화된 팝아웃 보기</span>
          </div>
          <span className="ops-badge">min {widget.minWidth} x {widget.minHeight}</span>
        </div>
      </section>
    </div>
  );
}
