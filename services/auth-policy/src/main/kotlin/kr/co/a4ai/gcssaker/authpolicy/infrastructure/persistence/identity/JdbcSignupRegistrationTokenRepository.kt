package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenStatus
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import javax.sql.DataSource

class JdbcSignupRegistrationTokenRepository(dataSource: DataSource) : SignupRegistrationTokenRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init { AuthPolicyJdbcMigrations.ensure(dataSource) }

    override fun list(limit: Int, offset: Int): List<SignupRegistrationTokenRecord> {
        jdbc.update("UPDATE signup_registration_tokens SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP")
        return jdbc.query("SELECT * FROM signup_registration_tokens ORDER BY created_at DESC LIMIT ? OFFSET ?", rowMapper, limit, offset)
    }

    override fun findByTokenId(tokenId: String): SignupRegistrationTokenRecord? =
        jdbc.query("SELECT * FROM signup_registration_tokens WHERE token_id = ?", rowMapper, tokenId).firstOrNull()

    override fun activeCandidates(now: Instant, limit: Int): List<SignupRegistrationTokenRecord> =
        jdbc.query(
            "SELECT * FROM signup_registration_tokens WHERE status = 'active' AND used_count < max_uses AND expires_at > ? ORDER BY created_at DESC LIMIT ?",
            rowMapper,
            Timestamp.from(now),
            limit,
        )

    override fun save(record: SignupRegistrationTokenRecord): SignupRegistrationTokenRecord {
        jdbc.update(
            """INSERT INTO signup_registration_tokens
               (token_id, token_hash, company_id, group_id, role, label, status, max_uses, used_count, expires_at, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            record.tokenId, record.tokenHash, record.companyId, record.groupId.value, record.role.name.lowercase(), record.label,
            record.status.name.lowercase(), record.maxUses, record.usedCount, Timestamp.from(record.expiresAt), record.createdBy,
            Timestamp.from(record.createdAt),
        )
        return record
    }

    override fun consume(tokenId: String, now: Instant): Boolean =
        jdbc.update(
            """UPDATE signup_registration_tokens
               SET used_count = used_count + 1,
                   status = CASE WHEN used_count + 1 >= max_uses THEN 'exhausted' ELSE status END,
                   last_used_at = ?, updated_at = CURRENT_TIMESTAMP
               WHERE token_id = ? AND status = 'active' AND used_count < max_uses AND expires_at > ?""",
            Timestamp.from(now),
            tokenId,
            Timestamp.from(now),
        ) == 1

    override fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean =
        jdbc.update(
            """UPDATE signup_registration_tokens
               SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = CURRENT_TIMESTAMP
               WHERE token_id = ? AND status = 'active'""",
            Timestamp.from(now), revokedBy, tokenId,
        ) == 1

    private val rowMapper = org.springframework.jdbc.core.RowMapper<SignupRegistrationTokenRecord> { rs, _ ->
        SignupRegistrationTokenRecord(
            tokenId = rs.getString("token_id"),
            tokenHash = rs.getString("token_hash"),
            companyId = rs.getInt("company_id"),
            groupId = GroupId(rs.getString("group_id")),
            role = kr.co.a4ai.gcssaker.authpolicy.domain.UserRole.valueOf(rs.getString("role").uppercase()),
            label = rs.getString("label"),
            maxUses = rs.getInt("max_uses"),
            usedCount = rs.getInt("used_count"),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
            createdBy = rs.getString("created_by"),
            createdAt = rs.getTimestamp("created_at").toInstant(),
            status = SignupRegistrationTokenStatus.valueOf(rs.getString("status").uppercase()),
            lastUsedAt = rs.getTimestamp("last_used_at")?.toInstant(),
            revokedAt = rs.getTimestamp("revoked_at")?.toInstant(),
            revokedBy = rs.getString("revoked_by"),
        )
    }
}
