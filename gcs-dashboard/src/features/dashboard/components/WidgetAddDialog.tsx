import type { DashboardLayoutItem } from "../dashboardLayout";

interface WidgetAddDialogProps {
  layout: DashboardLayoutItem[];
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
  onToggleWidget: (widgetId: DashboardLayoutItem["id"], visible: boolean) => void;
}

export function WidgetAddDialog({ layout, onApply, onCancel, onReset, onToggleWidget }: WidgetAddDialogProps) {
  return (
    <div className="widget-dialog__backdrop">
      <section aria-label="위젯 추가" aria-modal="true" className="widget-dialog" role="dialog">
        <header className="widget-dialog__header">
          <h2>위젯 추가</h2>
          <button className="widget-icon-button" onClick={onCancel} title="닫기" type="button">
            X
          </button>
        </header>

        <div className="widget-dialog__list">
          {layout.map((item) => (
            <button
              className="widget-dialog__item"
              key={item.id}
              onClick={() => onToggleWidget(item.id, !item.visible)}
              type="button"
            >
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.minWidth} x {item.minHeight}
                </small>
              </span>
              <span className={`ops-badge ${item.visible ? "is-online" : "is-warning"}`}>
                {item.visible ? "숨기기" : "표시"}
              </span>
            </button>
          ))}
        </div>

        <footer className="widget-dialog__footer">
          <button className="ops-command-button" onClick={onReset} type="button">
            초기화
          </button>
          <span />
          <button className="ops-command-button" onClick={onCancel} type="button">
            취소
          </button>
          <button className="ops-command-button is-primary" onClick={onApply} type="button">
            적용
          </button>
        </footer>
      </section>
    </div>
  );
}
