package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

data class DeviceProvisioningTokenIssueCommand(
    val groupId: String,
    val label: String,
    val ttlMinutes: Long,
    val maxUses: Int,
    val createdBy: String,
)

data class DeviceProvisioningTokenIssue(
    val record: DeviceProvisioningTokenRecord,
    val token: String,
)

data class DeviceProvisioningTokenRecord(
    val tokenId: String,
    val tokenHash: String,
    val groupId: GroupId,
    val label: String,
    val status: DeviceProvisioningTokenStatus,
    val maxUses: Int,
    val usedCount: Int,
    val expiresAt: Instant,
    val createdBy: String,
    val createdAt: Instant,
    val lastUsedAt: Instant? = null,
    val revokedAt: Instant? = null,
    val revokedBy: String? = null,
) {
    init {
        require(tokenId.isNotBlank()) { DeviceProvisioningTokenContract.TOKEN_ID_REQUIRED }
        require(tokenHash.isNotBlank()) { DeviceProvisioningTokenContract.TOKEN_HASH_REQUIRED }
        require(label.isNotBlank()) { DeviceProvisioningTokenContract.LABEL_REQUIRED }
        require(maxUses > 0) { DeviceProvisioningTokenContract.MAX_USES_INVALID }
        require(usedCount in 0..maxUses) { DeviceProvisioningTokenContract.USED_COUNT_INVALID }
        require(createdBy.isNotBlank()) { DeviceProvisioningTokenContract.CREATED_BY_REQUIRED }
    }

    fun activeAt(now: Instant): Boolean =
        status == DeviceProvisioningTokenStatus.ACTIVE && usedCount < maxUses && expiresAt.isAfter(now)
}

enum class DeviceProvisioningTokenStatus {
    ACTIVE,
    EXHAUSTED,
    REVOKED,
    EXPIRED,
}

interface DeviceProvisioningTokenRepository {
    fun list(): List<DeviceProvisioningTokenRecord>
    fun activeCandidates(now: Instant): List<DeviceProvisioningTokenRecord>
    fun save(record: DeviceProvisioningTokenRecord): DeviceProvisioningTokenRecord
    fun consume(tokenId: String, now: Instant): Boolean
    fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean
}

class InMemoryDeviceProvisioningTokenRepository(
    initialTokens: Collection<DeviceProvisioningTokenRecord> = emptyList(),
) : DeviceProvisioningTokenRepository {
    private val tokensById = initialTokens.associateBy { it.tokenId }.toMutableMap()

    override fun list(): List<DeviceProvisioningTokenRecord> =
        tokensById.values.sortedByDescending { it.createdAt }

    override fun activeCandidates(now: Instant): List<DeviceProvisioningTokenRecord> =
        tokensById.values.filter { it.activeAt(now) }

    @Synchronized
    override fun save(record: DeviceProvisioningTokenRecord): DeviceProvisioningTokenRecord {
        tokensById[record.tokenId] = record
        return record
    }

    @Synchronized
    override fun consume(tokenId: String, now: Instant): Boolean {
        val current = tokensById[tokenId]?.takeIf { it.activeAt(now) } ?: return false
        val nextUsedCount = current.usedCount + 1
        tokensById[tokenId] = current.copy(
            usedCount = nextUsedCount,
            status = if (nextUsedCount >= current.maxUses) {
                DeviceProvisioningTokenStatus.EXHAUSTED
            } else {
                DeviceProvisioningTokenStatus.ACTIVE
            }, lastUsedAt = now,
        )
        return true
    }

    @Synchronized
    override fun revoke(tokenId: String, revokedBy: String, now: Instant): Boolean {
        val current = tokensById[tokenId]?.takeIf { it.status == DeviceProvisioningTokenStatus.ACTIVE } ?: return false
        tokensById[tokenId] = current.copy(status = DeviceProvisioningTokenStatus.REVOKED, revokedAt = now, revokedBy = revokedBy)
        return true
    }
}

class DeviceProvisioningTokenGenerator(
    private val random: SecureRandom = SecureRandom(),
) {
    fun generate(): String {
        val bytes = ByteArray(DeviceProvisioningTokenContract.TOKEN_BYTE_LENGTH)
        random.nextBytes(bytes)
        return DeviceProvisioningTokenContract.TOKEN_PREFIX +
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}

class DeviceProvisioningTokenService(
    private val repository: DeviceProvisioningTokenRepository,
    private val passwordHasher: PasswordHasher,
    private val hierarchyRepository: OrganizationHierarchyRepository? = null,
    private val clock: Clock = Clock.systemUTC(),
    private val tokenGenerator: DeviceProvisioningTokenGenerator = DeviceProvisioningTokenGenerator(),
    private val idGenerator: () -> String = { UUID.randomUUID().toString() },
) {
    fun issue(command: DeviceProvisioningTokenIssueCommand): DeviceProvisioningTokenIssue {
        validateIssueCommand(command)
        val groupId = GroupId(command.groupId.trim())
        validateKnownGroup(groupId)
        val token = tokenGenerator.generate()
        val now = clock.instant()
        val record = DeviceProvisioningTokenRecord(
            tokenId = idGenerator(),
            tokenHash = passwordHasher.hash(token),
            groupId = groupId,
            label = command.label,
            status = DeviceProvisioningTokenStatus.ACTIVE,
            maxUses = command.maxUses,
            usedCount = DeviceProvisioningTokenContract.INITIAL_USED_COUNT,
            expiresAt = now.plus(Duration.ofMinutes(command.ttlMinutes)),
            createdBy = command.createdBy,
            createdAt = now,
        )
        return DeviceProvisioningTokenIssue(repository.save(record), token)
    }

    fun list(): List<DeviceProvisioningTokenRecord> =
        repository.list().map { withRuntimeStatus(it) }

    fun consume(rawToken: String): GroupId? {
        if (rawToken.isBlank()) {
            return null
        }
        val now = clock.instant()
        val matched = repository.activeCandidates(now).firstOrNull { candidate ->
            passwordHasher.verify(rawToken, candidate.tokenHash)
        } ?: return null
        return if (repository.consume(matched.tokenId, now)) matched.groupId else null
    }

    fun revoke(tokenId: String, revokedBy: String): Boolean {
        require(tokenId.isNotBlank()) { DeviceProvisioningTokenContract.TOKEN_ID_REQUIRED }
        require(revokedBy.isNotBlank()) { DeviceProvisioningTokenContract.CREATED_BY_REQUIRED }
        return repository.revoke(tokenId, revokedBy, clock.instant())
    }

    private fun withRuntimeStatus(record: DeviceProvisioningTokenRecord): DeviceProvisioningTokenRecord =
        if (record.status == DeviceProvisioningTokenStatus.ACTIVE && !record.expiresAt.isAfter(clock.instant())) {
            record.copy(status = DeviceProvisioningTokenStatus.EXPIRED)
        } else {
            record
        }

    private fun validateIssueCommand(command: DeviceProvisioningTokenIssueCommand) {
        require(command.groupId.isNotBlank()) { DeviceProvisioningTokenContract.GROUP_ID_REQUIRED }
        require(command.label.isNotBlank()) { DeviceProvisioningTokenContract.LABEL_REQUIRED }
        require(command.ttlMinutes in DeviceProvisioningTokenContract.MIN_TTL_MINUTES..DeviceProvisioningTokenContract.MAX_TTL_MINUTES) {
            DeviceProvisioningTokenContract.TTL_INVALID
        }
        require(command.maxUses in DeviceProvisioningTokenContract.MIN_MAX_USES..DeviceProvisioningTokenContract.MAX_MAX_USES) {
            DeviceProvisioningTokenContract.MAX_USES_INVALID
        }
        require(command.createdBy.isNotBlank()) { DeviceProvisioningTokenContract.CREATED_BY_REQUIRED }
    }

    private fun validateKnownGroup(groupId: GroupId) {
        val hierarchy = hierarchyRepository?.current() ?: return
        require(hierarchy.contains(groupId)) { DeviceProvisioningTokenContract.GROUP_NOT_FOUND }
    }
}

object DeviceProvisioningTokenContract {
    const val TOKEN_PREFIX = "gcs_boot_"
    const val TOKEN_BYTE_LENGTH = 32
    const val INITIAL_USED_COUNT = 0
    const val MIN_TTL_MINUTES = 5L
    const val MAX_TTL_MINUTES = 1_440L
    const val DEFAULT_TTL_MINUTES = 60L
    const val MIN_MAX_USES = 1
    const val MAX_MAX_USES = 100
    const val DEFAULT_MAX_USES = 1
    const val TOKEN_ID_REQUIRED = "device provisioning token id must not be blank"
    const val TOKEN_HASH_REQUIRED = "device provisioning token hash must not be blank"
    const val GROUP_ID_REQUIRED = "device provisioning group id must not be blank"
    const val GROUP_NOT_FOUND = "device provisioning group does not exist"
    const val LABEL_REQUIRED = "device provisioning token label must not be blank"
    const val CREATED_BY_REQUIRED = "device provisioning token creator must not be blank"
    const val TTL_INVALID = "device provisioning token ttl is out of range"
    const val MAX_USES_INVALID = "device provisioning token max uses is out of range"
    const val USED_COUNT_INVALID = "device provisioning token used count is invalid"
}
