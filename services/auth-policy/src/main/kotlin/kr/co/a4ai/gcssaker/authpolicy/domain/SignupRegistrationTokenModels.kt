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
) {
    fun activeAt(now: Instant): Boolean = usedCount < maxUses && expiresAt.isAfter(now)
}

data class SignupRegistrationTokenIssueCommand(
    val companyId: Int,
    val groupId: String,
    val label: String,
    val ttlMinutes: Long,
    val maxUses: Int,
    val createdBy: String,
)

data class SignupRegistrationTokenIssue(
    val record: SignupRegistrationTokenRecord,
    val token: String,
)

interface SignupRegistrationTokenRepository {
    fun list(): List<SignupRegistrationTokenRecord>
    fun activeCandidates(now: Instant): List<SignupRegistrationTokenRecord>
    fun save(record: SignupRegistrationTokenRecord): SignupRegistrationTokenRecord
    fun consume(tokenId: String, now: Instant): Boolean
}

interface SignupTransactionBoundary {
    fun <T> execute(action: () -> T): T
}

object DirectSignupTransactionBoundary : SignupTransactionBoundary {
    override fun <T> execute(action: () -> T): T = action()
}

class InMemorySignupRegistrationTokenRepository : SignupRegistrationTokenRepository {
    private val records = mutableMapOf<String, SignupRegistrationTokenRecord>()
    override fun list() = records.values.sortedByDescending { it.createdAt }
    override fun activeCandidates(now: Instant) = records.values.filter { it.activeAt(now) }
    @Synchronized override fun save(record: SignupRegistrationTokenRecord) = record.also { records[it.tokenId] = it }
    @Synchronized override fun consume(tokenId: String, now: Instant): Boolean {
        val record = records[tokenId]?.takeIf { it.activeAt(now) } ?: return false
        records[tokenId] = record.copy(usedCount = record.usedCount + 1)
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
        require(command.ttlMinutes in 5..10_080) { "ttl minutes must be between 5 and 10080" }
        require(command.maxUses in 1..100) { "max uses must be between 1 and 100" }
        val groupId = GroupId(command.groupId.trim())
        hierarchyRepository?.current()?.let { require(it.contains(groupId)) { "group does not exist" } }
        val token = generator.generate()
        val now = clock.instant()
        val record = SignupRegistrationTokenRecord(
            tokenId = idGenerator(),
            tokenHash = passwordHasher.hash(token),
            companyId = command.companyId,
            groupId = groupId,
            label = command.label.trim(),
            maxUses = command.maxUses,
            usedCount = 0,
            expiresAt = now.plus(Duration.ofMinutes(command.ttlMinutes)),
            createdBy = command.createdBy,
            createdAt = now,
        )
        return SignupRegistrationTokenIssue(repository.save(record), token)
    }

    fun list(): List<SignupRegistrationTokenRecord> = repository.list()

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
        action(SignupInvite(code, record.companyId, record.groupId))
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
