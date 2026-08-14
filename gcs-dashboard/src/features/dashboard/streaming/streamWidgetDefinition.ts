import type { ReactNode } from "react";

export interface StreamWidgetDefinition {
  id: string;
  title: string;
  minWidth: number;
  minHeight: number;
  renderLabel: ReactNode;
}

export const STREAM_GRID_WIDGET: StreamWidgetDefinition = {
  id: "stream-grid", title: "전체 스트림", minWidth: 360, minHeight: 220, renderLabel: "전체 스트림",
};

export const SELECTED_STREAM_WIDGET: StreamWidgetDefinition = {
  id: "selected-stream", title: "선택 스트림", minWidth: 360, minHeight: 300, renderLabel: "선택 스트림",
};
