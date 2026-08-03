package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRepository
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import javax.sql.DataSource

class JdbcSignupRegistrationTokenRepository(dataSource: DataSource) : SignupRegistrationTokenRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init { AuthPolicyJdbcMigrations.ensure(dataSource) }

    override fun list(): List<SignupRegistrationTokenRecord> =
        jdbc.query("SELECT * FROM signup_registration_tokens ORDER BY created_at DESC", rowMapper)

    override fun activeCandidates(now: Instant): List<SignupRegistrationTokenRecord> =
        jdbc.query(
            "SELECT * FROM signup_registration_tokens WHERE used_count < max_uses AND expires_at > ? ORDER BY created_at DESC",
            rowMapper,
            Timestamp.from(now),
        )

    override fun save(record: SignupRegistrationTokenRecord): SignupRegistrationTokenRecord {
        jdbc.update(
            """INSERT INTO signup_registration_tokens
               (token_id, token_hash, company_id, group_id, label, max_uses, used_count, expires_at, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            record.tokenId, record.tokenHash, record.companyId, record.groupId.value, record.label,
            record.maxUses, record.usedCount, Timestamp.from(record.expiresAt), record.createdBy,
            Timestamp.from(record.createdAt),
        )
        return record
    }

    override fun consume(tokenId: String, now: Instant): Boolean =
        jdbc.update(
            """UPDATE signup_registration_tokens SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP
               WHERE token_id = ? AND used_count < max_uses AND expires_at > ?""",
            tokenId,
            Timestamp.from(now),
        ) == 1

    private val rowMapper = org.springframework.jdbc.core.RowMapper<SignupRegistrationTokenRecord> { rs, _ ->
        SignupRegistrationTokenRecord(
            tokenId = rs.getString("token_id"),
            tokenHash = rs.getString("token_hash"),
            companyId = rs.getInt("company_id"),
            groupId = GroupId(rs.getString("group_id")),
            label = rs.getString("label"),
            maxUses = rs.getInt("max_uses"),
            usedCount = rs.getInt("used_count"),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
            createdBy = rs.getString("created_by"),
            createdAt = rs.getTimestamp("created_at").toInstant(),
        )
    }
}
