import type { ReactNode } from "react";
import type { AssetTreeNode } from "../assetTree";
import { getAssetTreeStatusText } from "../assetTree";

interface AssetTreePanelProps {
  controls?: ReactNode;
  root: AssetTreeNode;
}

function AssetNodeView({ node, level = 0 }: { node: AssetTreeNode; level?: number }) {
  return (
    <li className={`asset-node asset-node--${node.type}`} style={{ paddingLeft: `${level * 14}px` }}>
      <span className={`status-dot is-${node.status}`} />
      <span>{node.label}</span>
      <span className="asset-node__status">{getAssetTreeStatusText(node.status)}</span>
      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <AssetNodeView key={child.id} level={level + 1} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AssetTreePanel({ controls, root }: AssetTreePanelProps) {
  return (
    <>
      <div className="ops-panel__header">
        <h2 id="asset-tree-title">자산트리</h2>
        <span className="ops-panel__header-actions">
          <span className="ops-badge is-online">LIVE</span>
          {controls}
        </span>
      </div>

      <div className="asset-tree__root">{root.label}</div>
      <ul className="asset-tree__nodes">
        {root.children?.map((node) => <AssetNodeView key={node.id} node={node} />)}
      </ul>
    </>
  );
}
