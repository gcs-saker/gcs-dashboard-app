package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

data class SignupRegistrationTokenRecord(
    val tokenId: String,
    val tokenHash: String,
    val companyId: Int,
    val groupId: GroupId,
    val label: String,
    val maxUses: Int,
    val usedCount: Int,
    val expiresAt: Instant,
    val createdBy: String,
    val createdAt: Instant,
    val role: UserRole = UserRole.VIEWER,
    val status: SignupRegistrationTokenStatus = SignupRegistrationTokenStatus.ACTIVE,
    val lastUsedAt: Instant? = null,
    val revokedAt: Instant? = null,
    val revokedBy: String? = null,
) {
    fun activeAt(now: Instant): Boolean = status == SignupRegistrationTokenStatus.ACTIVE && usedCount < maxUses && expiresAt.isAfter(now)
}

enum class SignupRegistrationTokenStatus { ACTIVE, EXHAUSTED, REVOKED, EXPIRED }

data class SignupRegistrationTokenIssueCommand(
    val companyId: Int,
    val groupId: String,
    val label: String,
    val ttlMinutes: Long,
    val maxUses: Int,
    val createdBy: String,
    val role: UserRole = UserRole.VIEWER,
)

data class SignupRegistrationTokenIssue(
    val record: SignupRegistrationTokenRecord,
    val token: String,
)

interface SignupRegistrationTokenRepository {
    fun list(limit: Int = 200, offset: Int = 0): List<SignupRegistrationTokenRecord>
    fun findByTokenId(tokenId: String): SignupRegistrationTokenRecord?
    fun activeCandidates(now: Instant, limit: Int = 1_000): List<SignupRegistrationTokenRecord>
    fun save(record: SignupRegistrationTokenRecord): SignupRegistrationTokenRecord
    fun consume(tokenId: String, now: Instant): Boolean
    fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean
}

interface SignupTransactionBoundary {
    fun <T> execute(action: () -> T): T
}

object DirectSignupTransactionBoundary : SignupTransactionBoundary {
    override fun <T> execute(action: () -> T): T = action()
}

class InMemorySignupRegistrationTokenRepository : SignupRegistrationTokenRepository {
    private val records = mutableMapOf<String, SignupRegistrationTokenRecord>()
    override fun list(limit: Int, offset: Int) = records.values.sortedByDescending { it.createdAt }.drop(offset).take(limit)
    override fun findByTokenId(tokenId: String) = records[tokenId]
    override fun activeCandidates(now: Instant, limit: Int) = records.values.asSequence().filter { it.activeAt(now) }.take(limit).toList()
    @Synchronized override fun save(record: SignupRegistrationTokenRecord) = record.also { records[it.tokenId] = it }
    @Synchronized override fun consume(tokenId: String, now: Instant): Boolean {
        val record = records[tokenId]?.takeIf { it.activeAt(now) } ?: return false
        val usedCount = record.usedCount + 1
        records[tokenId] = record.copy(
            usedCount = usedCount,
            status = if (usedCount >= record.maxUses) SignupRegistrationTokenStatus.EXHAUSTED else record.status,
            lastUsedAt = now,
        )
        return true
    }
    @Synchronized override fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean {
        val record = records[tokenId]?.takeIf { it.status == SignupRegistrationTokenStatus.ACTIVE } ?: return false
        records[tokenId] = record.copy(status = SignupRegistrationTokenStatus.REVOKED, revokedAt = now, revokedBy = revokedBy)
        return true
    }
}

class SignupRegistrationTokenGenerator(private val random: SecureRandom = SecureRandom()) {
    fun generate(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return "gcs_signup_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}

class SignupRegistrationTokenService(
    private val repository: SignupRegistrationTokenRepository,
    private val passwordHasher: PasswordHasher,
    private val hierarchyRepository: OrganizationHierarchyRepository? = null,
    private val clock: Clock = Clock.systemUTC(),
    private val generator: SignupRegistrationTokenGenerator = SignupRegistrationTokenGenerator(),
    private val idGenerator: () -> String = { UUID.randomUUID().toString() },
    private val transactionBoundary: SignupTransactionBoundary = DirectSignupTransactionBoundary,
) : SignupInviteResolver {
    fun issue(command: SignupRegistrationTokenIssueCommand): SignupRegistrationTokenIssue {
        require(command.companyId > 0) { "company id must be positive" }
        require(command.groupId.isNotBlank()) { "group id must not be blank" }
        require(command.label.isNotBlank()) { "label must not be blank" }
        require(command.role.canBeIssuedByGroupAdmin()) { "administrator signup tokens are not allowed" }
        require(command.ttlMinutes in 5..10_080) { "ttl minutes must be between 5 and 10080" }
        require(command.maxUses in 1..100) { "max uses must be between 1 and 100" }
        val groupId = GroupId(command.groupId.trim())
        hierarchyRepository?.listAll()?.let { groups ->
            require(groups.any { it.id == groupId }) { "group does not exist" }
        }
        val token = generator.generate()
        val now = clock.instant()
        val record = SignupRegistrationTokenRecord(
            tokenId = idGenerator(),
            tokenHash = passwordHasher.hash(token),
            companyId = command.companyId,
            groupId = groupId,
            role = command.role,
            label = command.label.trim(),
            maxUses = command.maxUses,
            usedCount = 0,
            expiresAt = now.plus(Duration.ofMinutes(command.ttlMinutes)),
            createdBy = command.createdBy,
            createdAt = now,
        )
        return SignupRegistrationTokenIssue(repository.save(record), token)
    }

    fun list(limit: Int = 200, offset: Int = 0): List<SignupRegistrationTokenRecord> = repository.list(limit, offset)

    fun find(tokenId: String): SignupRegistrationTokenRecord? = repository.findByTokenId(tokenId)

    fun revoke(tokenId: String, revokedBy: String): Boolean =
        repository.revoke(tokenId, revokedBy, clock.instant())

    override fun findByCode(code: String): SignupInvite? {
        return useInvite(code) { it }
    }

    override fun <T> useInvite(code: String, action: (SignupInvite) -> T): T? = transactionBoundary.execute {
        if (code.isBlank()) return@execute null
        val now = clock.instant()
        val record = repository.activeCandidates(now).firstOrNull {
            passwordHasher.verify(code, it.tokenHash)
        } ?: return@execute null
        if (!repository.consume(record.tokenId, now)) return@execute null
        action(SignupInvite(code, record.companyId, record.groupId, record.role))
    }
}

class CompositeSignupInviteResolver(
    private vararg val resolvers: SignupInviteResolver,
) : SignupInviteResolver {
    override fun findByCode(code: String): SignupInvite? =
        resolvers.firstNotNullOfOrNull { it.findByCode(code) }

    override fun <T> useInvite(code: String, action: (SignupInvite) -> T): T? {
        resolvers.forEach { resolver -> resolver.useInvite(code, action)?.let { return it } }
        return null
    }
}
