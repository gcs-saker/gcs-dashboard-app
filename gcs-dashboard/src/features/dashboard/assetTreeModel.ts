export type AssetTreeStatus = "online" | "warning" | "offline";
export type AssetTreeNodeType = "root" | "group" | "device" | "stream" | "sensor";

export interface AssetTreeNode {
  id: string;
  label: string;
  type: AssetTreeNodeType;
  status: AssetTreeStatus;
  children?: AssetTreeNode[];
}
