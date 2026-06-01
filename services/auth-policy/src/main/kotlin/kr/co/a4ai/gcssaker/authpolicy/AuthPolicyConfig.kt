package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.NoopPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvite
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
import kr.co.a4ai.gcssaker.authpolicy.domain.StatelessRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryTimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.parseTimeSyncMode
import kr.co.a4ai.gcssaker.authpolicy.domain.normalizedSourceHost
import kr.co.a4ai.gcssaker.authpolicy.api.BearerPrincipalResolver
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.time.Instant

@Configuration
class AuthPolicyConfig {
    @Bean
    fun authRuntimeSettings(env: Environment): AuthRuntimeSettings =
        AuthRuntimeSettings.fromEnvironment(env)

    @Bean
    fun passwordHasher(): PasswordHasher = PasswordHasher()

    @Bean
    fun jwtTokenService(settings: AuthRuntimeSettings): JwtTokenService =
        JwtTokenService(
            secret = settings.jwtSecret,
            issuer = settings.jwtIssuer,
            accessTokenTtl = Duration.ofMinutes(settings.accessTokenExpireMinutes),
            refreshTokenTtl = Duration.ofMinutes(settings.refreshTokenExpireMinutes),
        )

    @Bean
    fun authUserRepository(
        settings: AuthRuntimeSettings,
        passwordHasher: PasswordHasher,
    ): InMemoryAuthUserRepository =
        InMemoryAuthUserRepository(
            listOf(
                AuthUser(
                    id = 1,
                    username = settings.operatorUsername,
                    email = "${settings.operatorUsername}@example.test",
                    passwordHash = passwordHasher.hash(settings.operatorPassword),
                    companyId = settings.operatorCompanyId,
                    role = UserRole.OPERATOR,
                    groupId = GroupId(settings.operatorGroupId),
                ),
                AuthUser(
                    id = 2,
                    username = settings.smokeUsername,
                    email = "${settings.smokeUsername}@example.test",
                    passwordHash = passwordHasher.hash(settings.smokePassword),
                    companyId = settings.smokeCompanyId,
                    role = UserRole.VIEWER,
                    groupId = GroupId(settings.smokeGroupId),
                ),
            ),
        )

    @Bean
    fun authSessionService(
        users: InMemoryAuthUserRepository,
        passwordHasher: PasswordHasher,
        tokenService: JwtTokenService,
        principalCache: PrincipalCache,
        refreshSessionStore: RefreshSessionStore,
    ): AuthSessionService =
        AuthSessionService(users, passwordHasher, tokenService, principalCache, refreshSessionStore)

    @Bean
    fun principalCache(
        settings: AuthRuntimeSettings,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
    ): PrincipalCache {
        if (!settings.redisPrincipalCacheEnabled) {
            return NoopPrincipalCache
        }
        return redisTemplate.getIfAvailable()?.let { RedisPrincipalCache(it) } ?: NoopPrincipalCache
    }

    @Bean
    fun refreshSessionStore(
        settings: AuthRuntimeSettings,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
    ): RefreshSessionStore {
        if (!settings.redisRefreshSessionEnabled) {
            return StatelessRefreshSessionStore
        }
        return redisTemplate.getIfAvailable()?.let { RedisRefreshSessionStore(it) } ?: StatelessRefreshSessionStore
    }

    @Bean
    fun bearerPrincipalResolver(sessions: AuthSessionService): BearerPrincipalResolver =
        BearerPrincipalResolver(sessions)

    @Bean
    fun authRegistrationService(
        users: InMemoryAuthUserRepository,
        passwordHasher: PasswordHasher,
        settings: AuthRuntimeSettings,
    ): AuthRegistrationService =
        AuthRegistrationService(users, passwordHasher, settings.signupInvites)

    @Bean
    fun groupPolicyService(): GroupPolicyService =
        GroupPolicyService(
            listOf(
                OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION),
                OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
                OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, GroupId("bn-1")),
                OrganizationUnit(GroupId("plt-b-1"), "B Company 1 Platoon", GroupType.PLATOON, GroupId("co-b")),
            ),
        )

    @Bean
    fun operationalReadRepository(): OperationalReadRepository {
        val group = GroupId("co-a")
        val timestamp = Instant.parse("2026-05-29T00:00:00Z")
        val sampleGateway = "raw.sample.front"
        val sampleAsset = AssetReadModel(
            id = 1,
            cid = "A4AI-GCS",
            uuid = "DRN-01",
            companyId = 1,
            type = "drone",
            name = "DRN-01",
            description = "M7 PoC telemetry-linked unmanned asset",
            imageUrl = null,
            status = "active",
            createdAt = timestamp,
            updatedAt = timestamp,
            groupId = group,
        )
        return InMemoryOperationalReadRepository(
            telemetry = listOf(
                TelemetryReadModel(
                    uuid = sampleGateway,
                    latitude = 35.8714,
                    longitude = 128.6014,
                    altitude = 120.0,
                    magneticX = 12.4,
                    magneticY = -3.2,
                    magneticZ = 42.1,
                    soc = "78",
                    phoneBatterySOC = 91.0,
                    velocity = 8.5,
                    totalDistance = 1520.0,
                    epochTime = "00:10:23",
                    portDistance = 250.0,
                    groupId = group,
                ),
            ),
            assetsByGateway = mapOf(sampleGateway to listOf(sampleAsset)),
        )
    }

    @Bean
    fun operationalEventRepository(): OperationalEventRepository {
        val group = GroupId("co-a")
        return InMemoryOperationalEventRepository(
            listOf(
                OperationalEventReadModel(
                    id = "ops-health-001",
                    occurredAt = Instant.parse("2026-06-01T00:00:00Z"),
                    severity = "info",
                    category = "api",
                    source = "API 서버",
                    message = "헬스체크 정상",
                    connections = 12,
                    latencyMs = 42,
                    throughputMbps = 18.4,
                    groupId = group,
                ),
                OperationalEventReadModel(
                    id = "ops-signaling-001",
                    occurredAt = Instant.parse("2026-06-01T00:05:00Z"),
                    severity = "info",
                    category = "signaling",
                    source = "Signaling 서버",
                    message = "WebRTC WHEP 연결 수립",
                    connections = 3,
                    latencyMs = 88,
                    throughputMbps = 42.1,
                    groupId = group,
                ),
                OperationalEventReadModel(
                    id = "ops-network-001",
                    occurredAt = Instant.parse("2026-06-01T00:12:00Z"),
                    severity = "warn",
                    category = "network",
                    source = "TURN 릴레이",
                    message = "직접 ICE 후보 실패 후 릴레이 경로 사용",
                    connections = 5,
                    latencyMs = 164,
                    throughputMbps = 31.6,
                    groupId = group,
                ),
                OperationalEventReadModel(
                    id = "ops-stream-001",
                    occurredAt = Instant.parse("2026-06-01T00:24:00Z"),
                    severity = "warn",
                    category = "stream",
                    source = "Stream Registry",
                    message = "송출 종료 감지",
                    connections = 1,
                    latencyMs = 110,
                    throughputMbps = 0.0,
                    groupId = group,
                ),
                OperationalEventReadModel(
                    id = "ops-security-001",
                    occurredAt = Instant.parse("2026-06-01T00:31:00Z"),
                    severity = "error",
                    category = "security",
                    source = "인증/인가 서버",
                    message = "만료된 세션으로 스트림 접근 거절",
                    connections = 0,
                    latencyMs = 73,
                    throughputMbps = 0.0,
                    groupId = group,
                ),
            ),
        )
    }

    @Bean
    fun timeSyncConfigRepository(env: Environment): TimeSyncConfigRepository {
        val mode = parseTimeSyncMode(env.getProperty("TIME_SYNC_MODE") ?: "public")
        val sourceHost = normalizedSourceHost(mode, env.getProperty("TIME_SYNC_SOURCE_HOST"))
        val sourcePort = env.getProperty("TIME_SYNC_SOURCE_PORT")?.toIntOrNull()?.takeIf { it in 1..65_535 } ?: 123
        val driftWarnMs = env.getProperty("TIME_SYNC_DRIFT_WARN_MS")?.toLongOrNull()?.takeIf { it in 1..600_000 } ?: 1_000
        return InMemoryTimeSyncConfigRepository(
            TimeSyncConfig(
                mode = mode,
                sourceHost = sourceHost,
                sourcePort = sourcePort,
                driftWarnMs = driftWarnMs,
                updatedAt = Instant.EPOCH,
                updatedBy = "system",
            ),
        )
    }

    @Bean
    fun timeSyncStatusService(repository: TimeSyncConfigRepository): TimeSyncStatusService =
        TimeSyncStatusService(repository)
}

data class AuthRuntimeSettings(
    val jwtSecret: String,
    val jwtIssuer: String,
    val accessTokenExpireMinutes: Long,
    val refreshTokenExpireMinutes: Long,
    val refreshCookieName: String,
    val refreshCookieSecure: Boolean,
    val refreshCookieSameSite: String,
    val allowedOrigins: AllowedOrigins,
    val operatorUsername: String,
    val operatorPassword: String,
    val operatorCompanyId: Int,
    val operatorGroupId: String,
    val smokeUsername: String,
    val smokePassword: String,
    val smokeCompanyId: Int,
    val smokeGroupId: String,
    val signupInvites: SignupInvites,
    val redisPrincipalCacheEnabled: Boolean = true,
    val redisRefreshSessionEnabled: Boolean = true,
) {
    companion object {
        private const val DEFAULT_SECRET = "local-auth-policy-secret-at-least-32-characters"

        fun fromEnvironment(env: Environment): AuthRuntimeSettings =
            AuthRuntimeSettings(
                jwtSecret = env.getProperty("AUTH_POLICY_JWT_SECRET")
                    ?: env.getProperty("AUTH_JWT_SECRET")
                    ?: DEFAULT_SECRET,
                jwtIssuer = env.getProperty("AUTH_POLICY_JWT_ISSUER")
                    ?: env.getProperty("AUTH_JWT_ISSUER")
                    ?: "gcs-saker",
                accessTokenExpireMinutes = longEnv(env, "AUTH_POLICY_ACCESS_TOKEN_EXPIRE_MINUTES", 30),
                refreshTokenExpireMinutes = longEnv(env, "AUTH_POLICY_REFRESH_TOKEN_EXPIRE_MINUTES", 10_080),
                refreshCookieName = env.getProperty("AUTH_POLICY_REFRESH_COOKIE_NAME")
                    ?: env.getProperty("AUTH_REFRESH_COOKIE_NAME")
                    ?: "gcs_saker_refresh",
                refreshCookieSecure = boolEnv(env, "AUTH_POLICY_REFRESH_COOKIE_SECURE", false),
                refreshCookieSameSite = env.getProperty("AUTH_POLICY_REFRESH_COOKIE_SAMESITE")
                    ?: env.getProperty("AUTH_REFRESH_COOKIE_SAMESITE")
                    ?: "lax",
                allowedOrigins = AllowedOrigins.of(
                    csvEnv(env, "AUTH_POLICY_ALLOWED_ORIGINS")
                        .ifEmpty { csvEnv(env, "BACKEND_CORS_ALLOW_ORIGINS") },
                ),
                operatorUsername = env.getProperty("AUTH_POLICY_OPERATOR_USERNAME") ?: "operator01",
                operatorPassword = env.getProperty("AUTH_POLICY_OPERATOR_PASSWORD") ?: "correct-password",
                operatorCompanyId = intEnv(env, "AUTH_POLICY_OPERATOR_COMPANY_ID", 1),
                operatorGroupId = env.getProperty("AUTH_POLICY_OPERATOR_GROUP_ID") ?: "co-a",
                smokeUsername = env.getProperty("AUTH_POLICY_SMOKE_USERNAME") ?: "m7-smoke-viewer",
                smokePassword = env.getProperty("AUTH_POLICY_SMOKE_PASSWORD") ?: "m7-smoke-pass",
                smokeCompanyId = intEnv(env, "AUTH_POLICY_SMOKE_COMPANY_ID", 1),
                smokeGroupId = env.getProperty("AUTH_POLICY_SMOKE_GROUP_ID") ?: "co-a",
                signupInvites = signupInvites(env),
                redisPrincipalCacheEnabled = boolEnv(env, "AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED", true),
                redisRefreshSessionEnabled = boolEnv(env, "AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED", true),
            )

        private fun longEnv(env: Environment, name: String, defaultValue: Long): Long =
            env.getProperty(name)?.toLongOrNull()?.takeIf { it > 0 } ?: defaultValue

        private fun intEnv(env: Environment, name: String, defaultValue: Int): Int =
            env.getProperty(name)?.toIntOrNull()?.takeIf { it > 0 } ?: defaultValue

        private fun boolEnv(env: Environment, name: String, defaultValue: Boolean): Boolean =
            env.getProperty(name)?.lowercase()?.let { it == "true" || it == "1" } ?: defaultValue

        private fun csvEnv(env: Environment, name: String): Set<String> =
            env.getProperty(name)
                ?.split(",")
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
                ?.toSet()
                ?: emptySet()

        private fun signupInvites(env: Environment): SignupInvites {
            val raw = env.getProperty("AUTH_POLICY_SIGNUP_INVITES") ?: "A4AI01:1:co-a"
            return SignupInvites.of(
                raw.split(",")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .map { item ->
                    val parts = item.split(":")
                    require(parts.size == 3) {
                        "AUTH_POLICY_SIGNUP_INVITES must use code:companyId:groupId entries"
                    }
                    SignupInvite(
                        code = parts[0].trim(),
                        companyId = parts[1].trim().toInt(),
                        groupId = GroupId(parts[2].trim()),
                    )
                },
            )
        }
    }
}

class AllowedOrigins private constructor(
    private val values: Set<String>,
) {
    operator fun contains(origin: String): Boolean = origin in values

    fun isEmpty(): Boolean = values.isEmpty()

    fun toSet(): Set<String> = values

    companion object {
        fun of(origins: Collection<String>): AllowedOrigins =
            AllowedOrigins(
                origins
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet(),
            )
    }
}
