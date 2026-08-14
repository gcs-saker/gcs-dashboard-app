package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryTimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.normalizedSourceHost
import kr.co.a4ai.gcssaker.authpolicy.domain.parseTimeSyncMode
import org.springframework.core.env.Environment
import java.time.Instant

internal fun timeSyncConfigRepositoryFromEnvironment(env: Environment): TimeSyncConfigRepository =
    InMemoryTimeSyncConfigRepository(timeSyncConfigFromEnvironment(env))

internal fun timeSyncConfigFromEnvironment(env: Environment): TimeSyncConfig {
    val mode = parseTimeSyncMode(env.getProperty(TimeSyncKeys.MODE) ?: TimeSyncDefaults.MODE)
    return TimeSyncConfig(
        mode = mode,
        sourceHost = normalizedSourceHost(mode, env.getProperty(TimeSyncKeys.SOURCE_HOST)),
        sourcePort = intEnv(env, TimeSyncKeys.SOURCE_PORT, TimeSyncDefaults.SOURCE_PORT) { it in 1..65_535 },
        driftWarnMs = longEnv(env, TimeSyncKeys.DRIFT_WARN_MS, TimeSyncDefaults.DRIFT_WARN_MS) { it in 1..600_000 },
        updatedAt = Instant.EPOCH,
        updatedBy = TimeSyncDefaults.UPDATED_BY,
    )
}

private object TimeSyncKeys {
    const val MODE = "TIME_SYNC_MODE"
    const val SOURCE_HOST = "TIME_SYNC_SOURCE_HOST"
    const val SOURCE_PORT = "TIME_SYNC_SOURCE_PORT"
    const val DRIFT_WARN_MS = "TIME_SYNC_DRIFT_WARN_MS"
}

private object TimeSyncDefaults {
    const val MODE = "public"
    const val SOURCE_PORT = 123
    const val DRIFT_WARN_MS = 1_000L
    const val UPDATED_BY = "system"
}

private fun intEnv(env: Environment, name: String, defaultValue: Int, isValid: (Int) -> Boolean): Int =
    env.getProperty(name)?.toIntOrNull()?.takeIf(isValid) ?: defaultValue

private fun longEnv(env: Environment, name: String, defaultValue: Long, isValid: (Long) -> Boolean): Long =
    env.getProperty(name)?.toLongOrNull()?.takeIf(isValid) ?: defaultValue
