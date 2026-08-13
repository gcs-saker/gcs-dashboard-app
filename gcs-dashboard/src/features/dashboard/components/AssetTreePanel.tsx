import type { ReactNode } from "react";
import type { AssetTreeNode } from "@dashboard/assetTree";
import { getAssetTreeStatusText } from "@dashboard/assetTree";

interface AssetTreePanelProps {
  controls?: ReactNode;
  onSelectStream?: (streamId: string) => void;
  root: AssetTreeNode;
}

function AssetNodeView({
  node,
  level = 0,
  onSelectStream,
}: {
  node: AssetTreeNode;
  level?: number;
  onSelectStream?: (streamId: string) => void;
}) {
  const isSelectableStream = node.type === "stream" && Boolean(onSelectStream);
  return (
    <li className={`asset-node asset-node--${node.type}`} style={{ paddingLeft: `${level * 14}px` }}>
      <span className={`status-dot is-${node.status}`} />
      {isSelectableStream ? (
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
            <AssetNodeView key={child.id} level={level + 1} node={child} onSelectStream={onSelectStream} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AssetTreePanel({ controls, onSelectStream, root }: AssetTreePanelProps) {
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
        {root.children?.map((node) => <AssetNodeView key={node.id} node={node} onSelectStream={onSelectStream} />)}
      </ul>
    </>
  );
}
