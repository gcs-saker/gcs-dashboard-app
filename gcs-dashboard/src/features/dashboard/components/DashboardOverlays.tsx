import type { ReactNode } from "react";
import type { AssetTreeNode } from "@dashboard/assets/assetTree";
import type {
  DashboardLayoutItem,
  DashboardWidgetDefinition,
  DashboardWidgetId,
} from "@dashboard/layout/dashboardLayout";
import type { StreamDeviceOption } from "@dashboard/assets/streamDevices";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { AssetTreePanel } from "./AssetTreePanel";
import { StreamDeviceConnectDialog } from "./StreamDeviceConnectDialog";
import { WidgetAddDialog } from "./WidgetAddDialog";
import { WidgetPopout } from "./WidgetPopout";

export interface DashboardOverlaysProps {
  assetTreeRoot: AssetTreeNode;
  assetTreeWidget: DashboardWidgetDefinition;
  editingStream: DashboardStreamSlot | null;
  isAssetDrawerOpen: boolean;
  isAssetTreeVisible: boolean;
  isDashboardActive: boolean;
  isWidgetDialogOpen: boolean;
  layout: DashboardLayoutItem[];
  onApplyWidgetDialog: () => void;
  onCancelStreamConnection: () => void;
  onCancelWidgetDialog: () => void;
  onCloseAssetDrawer: () => void;
  onClosePopout: () => void;
  onConnectDevice: (device: StreamDeviceOption) => void;
  onDisconnectStream: () => void;
  onResetLayout: () => void;
  onSelectAssetTreeStream: (streamId: string) => void;
  onSetDeviceAlias: (deviceId: string, alias: string) => void;
  onToggleWidget: (widgetId: DashboardWidgetId, visible: boolean) => void;
  panelClass: (baseClass: string, widgetId: DashboardWidgetId) => string;
  popoutWidget: DashboardWidgetDefinition | null;
  streamDevices: StreamDeviceOption[];
  widgetControls: (widgetId: DashboardWidgetId, title: string) => ReactNode;
}

export function DashboardOverlays({
  assetTreeRoot,
  assetTreeWidget,
  editingStream,
  isAssetDrawerOpen,
  isAssetTreeVisible,
  isDashboardActive,
  isWidgetDialogOpen,
  layout,
  onApplyWidgetDialog,
  onCancelStreamConnection,
  onCancelWidgetDialog,
  onCloseAssetDrawer,
  onClosePopout,
  onConnectDevice,
  onDisconnectStream,
  onResetLayout,
  onSelectAssetTreeStream,
  onSetDeviceAlias,
  onToggleWidget,
  panelClass,
  popoutWidget,
  streamDevices,
  widgetControls,
}: DashboardOverlaysProps) {
  return (
    <>
      {isDashboardActive && isAssetTreeVisible && isAssetDrawerOpen ? <AssetTreeDrawer {...{
        assetTreeRoot, assetTreeWidget, onCloseAssetDrawer, onSelectAssetTreeStream, onSetDeviceAlias,
        panelClass, widgetControls,
      }} /> : null}

      {isWidgetDialogOpen ? (
        <WidgetAddDialog
          layout={layout}
          onApply={onApplyWidgetDialog}
          onCancel={onCancelWidgetDialog}
          onReset={onResetLayout}
          onToggleWidget={onToggleWidget}
        />
      ) : null}

      {popoutWidget ? <WidgetPopout onClose={onClosePopout} widget={popoutWidget} /> : null}

      {editingStream ? (
        <StreamDeviceConnectDialog
          devices={streamDevices}
          onCancel={onCancelStreamConnection}
          onConnect={onConnectDevice}
          onDisconnect={onDisconnectStream}
          stream={editingStream}
        />
      ) : null}
    </>
  );
}

function AssetTreeDrawer(props: Pick<DashboardOverlaysProps,
  "assetTreeRoot" | "assetTreeWidget" | "onCloseAssetDrawer" | "onSelectAssetTreeStream" |
  "onSetDeviceAlias" | "panelClass">) {
  return <div className="asset-drawer__backdrop" onClick={props.onCloseAssetDrawer}>
    <aside aria-labelledby="asset-tree-title"
      className={props.panelClass("ops-panel asset-tree asset-drawer", "asset-tree")}
      data-widget-id={props.assetTreeWidget.id} id="asset-tree-drawer"
      onClick={(event) => event.stopPropagation()}
      style={{ minHeight: props.assetTreeWidget.minHeight, minWidth: props.assetTreeWidget.minWidth }}>
      <AssetTreePanel controls={<button className="widget-icon-button" onClick={props.onCloseAssetDrawer}
        title="자산트리 닫기" type="button">닫기</button>} onSelectStream={props.onSelectAssetTreeStream} onSetDeviceAlias={props.onSetDeviceAlias}
        root={props.assetTreeRoot} />
    </aside>
  </div>;
}
