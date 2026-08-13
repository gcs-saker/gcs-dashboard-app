import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AssetTreeNode } from "@dashboard/assetTree";
import { getAssetTreeStatusText } from "@dashboard/assetTree";
import { useAssetDeviceAlias } from "@dashboard/hooks/useAssetDeviceAlias";

interface AssetTreePanelProps {
  canRenameDevices?: boolean;
  controls?: ReactNode;
  currentUsername?: string;
  onSelectStream?: (streamId: string) => void;
  root: AssetTreeNode;
}

function AssetNodeView({
  node,
  level = 0,
  onSelectStream,
  onRenameDevice,
  savingDeviceUuid,
}: {
  node: AssetTreeNode;
  level?: number;
  onSelectStream?: (streamId: string) => void;
  onRenameDevice?: (deviceUuid: string, displayName: string) => Promise<void>;
  savingDeviceUuid?: string | null;
}) {
  const isSelectableStream = node.type === "stream" && Boolean(onSelectStream);
  return (
    <li className={`asset-node asset-node--${node.type}`} style={{ paddingLeft: `${level * 14}px` }}>
      <span className={`status-dot is-${node.status}`} />
      {node.type === "device" && onRenameDevice ? (
        <DeviceAliasEditor
          device={node}
          isSaving={savingDeviceUuid === node.id}
          onRename={onRenameDevice}
        />
      ) : isSelectableStream ? (
        <button className="asset-node__select" type="button" onClick={() => onSelectStream?.(node.id)}>
          {node.label}
        </button>
      ) : (
        <span>{node.label}</span>
      )}
      {node.detail ? <small className="asset-node__detail">{node.detail}</small> : null}
      <span className="asset-node__status">{getAssetTreeStatusText(node.status)}</span>
      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <AssetNodeView key={child.id} level={level + 1} node={child} onRenameDevice={onRenameDevice} onSelectStream={onSelectStream} savingDeviceUuid={savingDeviceUuid} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DeviceAliasEditor({ device, isSaving, onRename }: {
  device: AssetTreeNode;
  isSaving: boolean;
  onRename: (deviceUuid: string, displayName: string) => Promise<void>;
}) {
  const [alias, setAlias] = useState(device.label);
  useEffect(() => setAlias(device.label), [device.label]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const displayName = alias.trim();
    if (displayName && displayName !== device.label) void onRename(device.id, displayName);
  };
  return (
    <form className="asset-node__alias-form" onSubmit={submit}>
      <input aria-label={`${device.label} 장비 별칭`} maxLength={128} onChange={(event) => setAlias(event.target.value)} value={alias} />
      <button disabled={isSaving || !alias.trim() || alias.trim() === device.label} type="submit">{isSaving ? "저장 중" : "저장"}</button>
    </form>
  );
}

export function AssetTreePanel({ canRenameDevices = false, controls, currentUsername = "", onSelectStream, root }: AssetTreePanelProps) {
  const alias = useAssetDeviceAlias(currentUsername);
  return (
    <>
      <div className="ops-panel__header">
        <h2 id="asset-tree-title">자산트리</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge is-${root.status}`}>{getAssetTreeStatusText(root.status)}</span>
          {controls}
        </span>
      </div>

      <div className="asset-tree__root">{root.label}</div>
      {alias.errorMessage ? <p className="asset-tree__error" role="alert">{alias.errorMessage}</p> : null}
      <ul className="asset-tree__nodes">
        {root.children?.map((node) => <AssetNodeView key={node.id} node={node} onRenameDevice={canRenameDevices ? alias.rename : undefined} onSelectStream={onSelectStream} savingDeviceUuid={alias.savingDeviceUuid} />)}
      </ul>
    </>
  );
}
