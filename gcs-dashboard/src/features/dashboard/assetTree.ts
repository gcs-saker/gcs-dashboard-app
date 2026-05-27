export type AssetTreeStatus = "online" | "warning" | "offline";
export type AssetTreeNodeType = "root" | "group" | "device" | "stream" | "sensor";

export interface AssetTreeNode {
  id: string;
  label: string;
  type: AssetTreeNodeType;
  status: AssetTreeStatus;
  children?: AssetTreeNode[];
}

export const DEFAULT_ASSET_TREE: AssetTreeNode = {
  id: "gcs-saker",
  label: "GCS-SAKER",
  type: "root",
  status: "online",
  children: [
    {
      id: "group-drone",
      label: "드론",
      type: "group",
      status: "online",
      children: [
        {
          id: "DRN-01",
          label: "DRN-01",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.front", label: "전방 EO", type: "stream", status: "online" }],
        },
        {
          id: "DRN-02",
          label: "DRN-02",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.thermal", label: "열화상", type: "stream", status: "warning" }],
        },
      ],
    },
    {
      id: "group-ugv",
      label: "지상로봇",
      type: "group",
      status: "warning",
      children: [
        {
          id: "UGV-01",
          label: "UGV-01",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.rear", label: "후방 AI", type: "stream", status: "online" }],
        },
        { id: "UGV-02", label: "UGV-02", type: "device", status: "warning" },
      ],
    },
    {
      id: "group-sensor",
      label: "센서",
      type: "group",
      status: "warning",
      children: [
        { id: "SEN-01", label: "SEN-01", type: "sensor", status: "online" },
        { id: "SEN-04", label: "SEN-04", type: "sensor", status: "offline" },
      ],
    },
  ],
};

export function getAssetTreeStatusText(status: AssetTreeStatus): string {
  switch (status) {
    case "online":
      return "정상";
    case "warning":
      return "주의";
    case "offline":
      return "오프라인";
  }
}

export function collectAssetTreeNodes(root: AssetTreeNode): AssetTreeNode[] {
  return [root, ...(root.children ?? []).flatMap((child) => collectAssetTreeNodes(child))];
}
