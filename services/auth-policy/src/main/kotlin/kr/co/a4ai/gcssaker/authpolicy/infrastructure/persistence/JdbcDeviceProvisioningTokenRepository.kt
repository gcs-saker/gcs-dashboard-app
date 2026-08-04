package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.sql.Timestamp
import java.time.Instant
import javax.sql.DataSource

class JdbcDeviceProvisioningTokenRepository(
    dataSource: DataSource,
) : DeviceProvisioningTokenRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }

    override fun list(): List<DeviceProvisioningTokenRecord> {
        jdbc.update(DeviceProvisioningTokenSql.markExpired, DeviceProvisioningTokenStatus.EXPIRED.apiValue())
        return jdbc.query(DeviceProvisioningTokenSql.selectAll, rowMapper)
    }

    override fun activeCandidates(now: Instant): List<DeviceProvisioningTokenRecord> =
        jdbc.query(DeviceProvisioningTokenSql.selectActiveCandidates, rowMapper, Timestamp.from(now))

    @Synchronized
    override fun save(record: DeviceProvisioningTokenRecord): DeviceProvisioningTokenRecord {
        jdbc.update(
            DeviceProvisioningTokenSql.insert,
            record.tokenId,
            record.tokenHash,
            record.groupId.value,
            record.label,
            record.status.apiValue(),
            record.maxUses,
            record.usedCount,
            Timestamp.from(record.expiresAt),
            record.createdBy,
            Timestamp.from(record.createdAt),
        )
        return record
    }

    override fun consume(tokenId: String, now: Instant): Boolean =
        jdbc.update(
            DeviceProvisioningTokenSql.consume,
            DeviceProvisioningTokenStatus.EXHAUSTED.apiValue(),
            Timestamp.from(now),
            tokenId,
            DeviceProvisioningTokenStatus.ACTIVE.apiValue(),
            Timestamp.from(now),
        ) == 1

    override fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean =
        jdbc.update(
            DeviceProvisioningTokenSql.revoke,
            DeviceProvisioningTokenStatus.REVOKED.apiValue(),
            Timestamp.from(now),
            revokedBy,
            tokenId,
            DeviceProvisioningTokenStatus.ACTIVE.apiValue(),
        ) == 1

    private companion object {
        val rowMapper = RowMapper<DeviceProvisioningTokenRecord> { rs, _ ->
            DeviceProvisioningTokenRecord(
                tokenId = rs.getString(DeviceProvisioningTokenColumns.tokenId),
                tokenHash = rs.getString(DeviceProvisioningTokenColumns.tokenHash),
                groupId = GroupId(rs.getString(DeviceProvisioningTokenColumns.groupId)),
                label = rs.getString(DeviceProvisioningTokenColumns.label),
                status = DeviceProvisioningTokenStatus.valueOf(
                    rs.getString(DeviceProvisioningTokenColumns.status).uppercase(),
                ),
                maxUses = rs.getInt(DeviceProvisioningTokenColumns.maxUses),
                usedCount = rs.getInt(DeviceProvisioningTokenColumns.usedCount),
                expiresAt = rs.getTimestamp(DeviceProvisioningTokenColumns.expiresAt).toInstant(),
                createdBy = rs.getString(DeviceProvisioningTokenColumns.createdBy),
                createdAt = rs.getTimestamp(DeviceProvisioningTokenColumns.createdAt).toInstant(),
                lastUsedAt = rs.getTimestamp(DeviceProvisioningTokenColumns.lastUsedAt)?.toInstant(),
                revokedAt = rs.getTimestamp(DeviceProvisioningTokenColumns.revokedAt)?.toInstant(),
                revokedBy = rs.getString(DeviceProvisioningTokenColumns.revokedBy),
            )
        }
    }
}

private fun DeviceProvisioningTokenStatus.apiValue(): String = name.lowercase()

private object DeviceProvisioningTokenColumns {
    const val tokenId = "token_id"
    const val tokenHash = "token_hash"
    const val groupId = "group_id"
    const val label = "label"
    const val status = "status"
    const val maxUses = "max_uses"
    const val usedCount = "used_count"
    const val expiresAt = "expires_at"
    const val createdBy = "created_by"
    const val createdAt = "created_at"
    const val lastUsedAt = "last_used_at"
    const val revokedAt = "revoked_at"
    const val revokedBy = "revoked_by"
}

private object DeviceProvisioningTokenSql {
    const val selectAll = """
        SELECT token_id, token_hash, group_id, label, status, max_uses, used_count, expires_at, created_by, created_at,
               last_used_at, revoked_at, revoked_by
        FROM device_provisioning_tokens
        ORDER BY created_at DESC, token_id ASC
    """
    const val selectActiveCandidates = """
        SELECT token_id, token_hash, group_id, label, status, max_uses, used_count, expires_at, created_by, created_at,
               last_used_at, revoked_at, revoked_by
        FROM device_provisioning_tokens
        WHERE status = 'active'
          AND used_count < max_uses
          AND expires_at > ?
        ORDER BY created_at DESC, token_id ASC
    """
    const val insert = """
        INSERT INTO device_provisioning_tokens (
            token_id, token_hash, group_id, label, status, max_uses, used_count, expires_at, created_by, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val consume = """
        UPDATE device_provisioning_tokens
        SET used_count = used_count + 1,
            status = CASE WHEN used_count + 1 >= max_uses THEN ? ELSE status END,
            last_used_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE token_id = ?
          AND status = ?
          AND used_count < max_uses
          AND expires_at > ?
    """
    const val markExpired = """
        UPDATE device_provisioning_tokens SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP
    """
    const val revoke = """
        UPDATE device_provisioning_tokens
        SET status = ?, revoked_at = ?, revoked_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE token_id = ? AND status = ?
    """
}
