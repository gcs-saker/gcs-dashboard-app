import type { ProvisioningTokenRecord } from "@dashboard/devices/deviceProvisioningTokens";

export function ProvisioningTokenRecordCard({ record }: { record: ProvisioningTokenRecord }) {
  return <article className="provisioning-token-panel__record">
    <span>{record.groupId}</span>
    <strong>{record.label}</strong>
    <em>{record.status} · {record.usedCount}/{record.maxUses}</em>
    <small>만료 {new Date(record.expiresAt).toLocaleString()}</small>
  </article>;
}
