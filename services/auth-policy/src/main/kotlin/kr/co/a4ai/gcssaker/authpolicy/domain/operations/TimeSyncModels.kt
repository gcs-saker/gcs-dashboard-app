package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

enum class TimeSyncMode {
    PUBLIC,
    CLOSED_NETWORK,
    MANUAL,
}

enum class TimeSyncHealth {
    OK,
    WARN,
    ERROR,
}

data class TimeSyncConfig(
    val mode: TimeSyncMode,
    val sourceHost: String?,
    val sourcePort: Int,
    val driftWarnMs: Long,
    val updatedAt: Instant,
    val updatedBy: String,
)

data class TimeSyncStatus(
    val config: TimeSyncConfig,
    val serverTime: Instant,
    val monotonicMs: Long,
    val timezone: String,
    val checkedAt: Instant,
    val health: TimeSyncHealth,
    val message: String,
)

data class UpdateTimeSyncConfigCommand(
    val mode: String,
    val sourceHost: String?,
    val sourcePort: Int?,
    val driftWarnMs: Long?,
)

interface TimeSyncConfigRepository {
    fun current(): TimeSyncConfig
    fun update(command: UpdateTimeSyncConfigCommand, principal: AuthenticatedPrincipal, now: Instant): TimeSyncConfig
}

class InMemoryTimeSyncConfigRepository(initial: TimeSyncConfig) : TimeSyncConfigRepository {
    private val current = AtomicReference(initial)

    override fun current(): TimeSyncConfig = current.get()

    override fun update(
        command: UpdateTimeSyncConfigCommand,
        principal: AuthenticatedPrincipal,
        now: Instant,
    ): TimeSyncConfig {
        val mode = parseTimeSyncMode(command.mode)
        val sourceHost = normalizedSourceHost(mode, command.sourceHost)
        val sourcePort = command.sourcePort ?: 123
        require(sourcePort in 1..65_535) { "sourcePort must be between 1 and 65535" }
        val driftWarnMs = command.driftWarnMs ?: current.get().driftWarnMs
        require(driftWarnMs in 1..600_000) { "driftWarnMs must be between 1 and 600000" }

        return TimeSyncConfig(
            mode = mode,
            sourceHost = sourceHost,
            sourcePort = sourcePort,
            driftWarnMs = driftWarnMs,
            updatedAt = now,
            updatedBy = principal.username,
        ).also(current::set)
    }
}

class TimeSyncStatusService(
    private val repository: TimeSyncConfigRepository,
    private val now: () -> Instant = Instant::now,
    private val monotonicMs: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    fun status(): TimeSyncStatus {
        val checkedAt = now()
        val config = repository.current()
        val health = when {
            config.mode == TimeSyncMode.MANUAL -> TimeSyncHealth.WARN
            config.sourceHost.isNullOrBlank() -> TimeSyncHealth.ERROR
            else -> TimeSyncHealth.OK
        }
        return TimeSyncStatus(
            config = config,
            serverTime = checkedAt,
            monotonicMs = monotonicMs(),
            timezone = "UTC",
            checkedAt = checkedAt,
            health = health,
            message = messageFor(config, health),
        )
    }

    private fun messageFor(config: TimeSyncConfig, health: TimeSyncHealth): String =
        when (health) {
            TimeSyncHealth.OK -> "${config.sourceHost}:${config.sourcePort} 기준으로 시간 소스가 설정되었습니다."
            TimeSyncHealth.WARN -> "수동/격리 모드입니다. 서버 시간 drift를 운영자가 주기적으로 확인해야 합니다."
            TimeSyncHealth.ERROR -> "시간 소스가 설정되지 않았습니다."
        }
}

fun parseTimeSyncMode(raw: String): TimeSyncMode =
    when (raw.trim().lowercase().replace("-", "_")) {
        "public" -> TimeSyncMode.PUBLIC
        "closed_network", "closed", "private" -> TimeSyncMode.CLOSED_NETWORK
        "manual", "isolated" -> TimeSyncMode.MANUAL
        else -> throw IllegalArgumentException("mode must be public, closed_network, or manual")
    }

fun normalizedSourceHost(mode: TimeSyncMode, rawSourceHost: String?): String? {
    val sourceHost = rawSourceHost?.trim()?.takeIf { it.isNotEmpty() }
    return when (mode) {
        TimeSyncMode.PUBLIC -> sourceHost ?: "pool.ntp.org"
        TimeSyncMode.CLOSED_NETWORK -> sourceHost
            ?: throw IllegalArgumentException("sourceHost is required for closed_network mode")
        TimeSyncMode.MANUAL -> null
    }
}
