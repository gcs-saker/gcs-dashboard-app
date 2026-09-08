import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AssetTreeNode } from "@dashboard/assets/assetTree";
import { getAssetTreeStatusText } from "@dashboard/assets/assetTree";

interface AssetTreePanelProps {
  controls?: ReactNode;
  onSelectStream?: (streamId: string) => void;
  onSetDeviceAlias?: (deviceId: string, alias: string) => void;
  root: AssetTreeNode;
}

function AssetNodeView({
  node,
  level = 0,
  onSelectStream,
  onSetDeviceAlias,
}: {
  node: AssetTreeNode;
  level?: number;
  onSelectStream?: (streamId: string) => void;
  onSetDeviceAlias?: (deviceId: string, alias: string) => void;
}) {
  const isSelectableStream = node.type === "stream" && Boolean(onSelectStream);
  return (
    <li className={`asset-node asset-node--${node.type}`} style={{ paddingLeft: `${level * 14}px` }}>
      <span className={`status-dot is-${node.status}`} />
      {node.type === "device" && onSetDeviceAlias ? (
        <PersonalDeviceAliasEditor device={node} onSave={onSetDeviceAlias} />
      ) : isSelectableStream ? (
        <button className="asset-node__select" type="button" onClick={() => onSelectStream?.(node.id)}>
          {node.label}
        </button>
      ) : (
        <span className="asset-node__label">{node.label}</span>
      )}
      {node.detail ? <small className="asset-node__detail">{node.detail}</small> : null}
      <span className="asset-node__status">{getAssetTreeStatusText(node.status)}</span>
      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <AssetNodeView
              key={child.id}
              level={level + 1}
              node={child}
              onSelectStream={onSelectStream}
              onSetDeviceAlias={onSetDeviceAlias}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PersonalDeviceAliasEditor({
  device,
  onSave,
}: {
  device: AssetTreeNode;
  onSave: (deviceId: string, alias: string) => void;
}) {
  const [alias, setAlias] = useState(device.label);
  useEffect(() => setAlias(device.label), [device.label]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSave(device.id, alias.trim());
  };

  return (
    <form className="asset-node__alias-form" onSubmit={submit}>
      <input
        aria-label={`${device.label} 개인 별칭`}
        maxLength={128}
        onChange={(event) => setAlias(event.target.value)}
        value={alias}
      />
      <button disabled={alias.trim() === device.label} type="submit">저장</button>
    </form>
  );
}

export function AssetTreePanel({ controls, onSelectStream, onSetDeviceAlias, root }: AssetTreePanelProps) {
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
      <ul className="asset-tree__nodes">
        {root.children?.map((node) => (
          <AssetNodeView
            key={node.id}
            node={node}
            onSelectStream={onSelectStream}
            onSetDeviceAlias={onSetDeviceAlias}
          />
        ))}
      </ul>
    </>
  );
}
