package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CachedAuthUserRepository
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
import kr.co.a4ai.gcssaker.authpolicy.application.AsyncOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.InMemoryOperationalAuditSink
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisherMetrics
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogger
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisCachePolicy
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisTemplateStringKeyValueStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.observability.AuthPolicyObservation
import io.micrometer.observation.ObservationRegistry
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import org.springframework.core.task.TaskExecutor
import com.fasterxml.jackson.databind.ObjectMapper
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ThreadPoolExecutor
import javax.sql.DataSource

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
        dataSource: ObjectProvider<DataSource>,
    ): AuthUserRepository {
        val initialUsers = seedAuthUsers(settings, passwordHasher)
        val repository = if (settings.jdbcPersistenceEnabled) {
            dataSource.getIfAvailable()?.let { JdbcAuthUserRepository(it, initialUsers) }
                ?: InMemoryAuthUserRepository(initialUsers)
        } else {
            InMemoryAuthUserRepository(initialUsers)
        }
        return if (settings.l1AuthUserCacheEnabled) CachedAuthUserRepository(repository) else repository
    }

    @Bean
    fun authSessionService(
        users: AuthUserRepository,
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
        failureLogger: OperationalFailureLoggerFacade,
    ): PrincipalCache {
        if (!settings.redisPrincipalCacheEnabled) {
            return NoopPrincipalCache
        }
        return redisTemplate.getIfAvailable()
            ?.let { ResilientPrincipalCache(RedisPrincipalCache(it), failureLogger) }
            ?: NoopPrincipalCache
    }

    @Bean
    fun refreshSessionStore(
        settings: AuthRuntimeSettings,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        failureLogger: OperationalFailureLoggerFacade,
    ): RefreshSessionStore {
        if (!settings.redisRefreshSessionEnabled) {
            return StatelessRefreshSessionStore
        }
        return redisTemplate.getIfAvailable()
            ?.let { ResilientRefreshSessionStore(RedisRefreshSessionStore(it), failureLogger) }
            ?: StatelessRefreshSessionStore
    }

    @Bean
    fun operationalPostProcessingExecutor(settings: AuthRuntimeSettings): TaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = settings.postProcessingCorePoolSize
            maxPoolSize = settings.postProcessingMaxPoolSize
            queueCapacity = settings.postProcessingQueueCapacity
            setThreadNamePrefix("auth-policy-post-")
            setRejectedExecutionHandler(ThreadPoolExecutor.CallerRunsPolicy())
            initialize()
        }

    @Bean
    fun operationalAuditSink(): InMemoryOperationalAuditSink = InMemoryOperationalAuditSink()

    @Bean
    fun operationalAuditPublisherMetrics(): OperationalAuditPublisherMetrics = OperationalAuditPublisherMetrics()

    @Bean
    fun operationalAuditPublisher(
        settings: AuthRuntimeSettings,
        operationalPostProcessingExecutor: TaskExecutor,
        auditSink: InMemoryOperationalAuditSink,
        auditMetrics: OperationalAuditPublisherMetrics,
    ): OperationalAuditPublisher =
        if (settings.asyncPostProcessingEnabled) {
            AsyncOperationalAuditPublisher(operationalPostProcessingExecutor, auditSink, auditMetrics)
        } else {
            NoopOperationalAuditPublisher
        }

    @Bean
    fun settingsAuditPublisher(
        operationalEventRepository: OperationalEventRepository,
    ): SettingsAuditPublisher =
        RepositorySettingsAuditPublisher(operationalEventRepository)

    @Bean
    fun securityAuditPublisher(
        operationalEventRepository: OperationalEventRepository,
    ): SecurityAuditPublisher =
        RepositorySecurityAuditPublisher(operationalEventRepository)

    @Bean
    fun operationalFailureLogger(
        operationalEventRepository: OperationalEventRepository,
    ): OperationalFailureLoggerFacade =
        OperationalFailureLogger(operationalEventRepository)

    @Bean
    fun authPolicyObservation(registry: ObservationRegistry): AuthPolicyObservation =
        AuthPolicyObservation(registry)

    @Bean
    fun authRegistrationService(
        users: AuthUserRepository,
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
    fun operationalReadRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        objectMapper: ObjectMapper,
    ): OperationalReadRepository {
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
        val telemetry = listOf(
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
        )
        val assetsByGateway = mapOf(sampleGateway to listOf(sampleAsset))
        val repository = if (settings.jdbcPersistenceEnabled) {
            dataSource.getIfAvailable()?.let {
                JdbcOperationalReadRepository(
                    dataSource = it,
                    telemetry = telemetry,
                    assetsByGateway = assetsByGateway,
                )
            } ?: InMemoryOperationalReadRepository(
                telemetry = telemetry,
                assetsByGateway = assetsByGateway,
            )
        } else {
            InMemoryOperationalReadRepository(
                telemetry = telemetry,
                assetsByGateway = assetsByGateway,
            )
        }
        if (!settings.redisOperationalReadCacheEnabled) {
            return repository
        }
        return redisTemplate.getIfAvailable()
            ?.let {
                RedisOperationalReadRepository(
                    delegate = repository,
                    store = RedisTemplateStringKeyValueStore(it),
                    objectMapper = objectMapper,
                    policy = RedisCachePolicy(
                        keyPrefix = settings.operationalReadCacheKeyPrefix,
                        ttl = Duration.ofSeconds(settings.operationalReadCacheTtlSeconds),
                        staleKeyPrefix = settings.operationalReadStaleCacheKeyPrefix,
                        staleTtl = Duration.ofSeconds(settings.operationalReadStaleCacheTtlSeconds),
                        ttlJitterRatio = settings.operationalReadCacheTtlJitterRatio,
                    ),
                )
            }
            ?: repository
    }

    @Bean
    fun operationalEventRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        objectMapper: ObjectMapper,
    ): OperationalEventRepository {
        val initialEvents = seedOperationalEvents()
        val repository = if (settings.jdbcPersistenceEnabled) {
            dataSource.getIfAvailable()?.let { JdbcOperationalEventRepository(it, initialEvents) }
                ?: InMemoryOperationalEventRepository(initialEvents)
        } else {
            InMemoryOperationalEventRepository(initialEvents)
        }
        if (!settings.redisOperationalEventCacheEnabled) {
            return repository
        }
        return redisTemplate.getIfAvailable()
            ?.let {
                RedisOperationalEventRepository(
                    delegate = repository,
                    store = RedisTemplateStringKeyValueStore(it),
                    objectMapper = objectMapper,
                    policy = RedisCachePolicy(
                        keyPrefix = settings.operationalEventCacheKeyPrefix,
                        ttl = Duration.ofSeconds(settings.operationalEventCacheTtlSeconds),
                        staleKeyPrefix = settings.operationalEventStaleCacheKeyPrefix,
                        staleTtl = Duration.ofSeconds(settings.operationalEventStaleCacheTtlSeconds),
                        ttlJitterRatio = settings.operationalEventCacheTtlJitterRatio,
                    ),
                )
            }
            ?: repository
    }

    private fun seedOperationalEvents(): List<OperationalEventReadModel> {
        val group = GroupId("co-a")
        return listOf(
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
                eventType = "webrtc.connected",
                sourceService = "mediamtx",
                source = "Signaling 서버",
                message = "WebRTC WHEP 연결 수립",
                connections = 3,
                latencyMs = 88,
                throughputMbps = 42.1,
                groupId = group,
                streamId = "raw/local/webcam",
                connectionId = "conn-whep-001",
                icePath = "srflx",
            ),
            OperationalEventReadModel(
                id = "ops-network-001",
                occurredAt = Instant.parse("2026-06-01T00:12:00Z"),
                severity = "warn",
                category = "network",
                eventType = "ice.relay_fallback",
                sourceService = "turn",
                source = "TURN 릴레이",
                message = "직접 ICE 후보 실패 후 릴레이 경로 사용",
                connections = 5,
                latencyMs = 164,
                throughputMbps = 31.6,
                groupId = group,
                streamId = "raw/local/webcam",
                connectionId = "conn-whep-001",
                icePath = "relay",
                relayFallbackReason = "srflx candidate failed",
            ),
            OperationalEventReadModel(
                id = "ops-stream-001",
                occurredAt = Instant.parse("2026-06-01T00:24:00Z"),
                severity = "warn",
                category = "stream",
                eventType = "stream.disconnected",
                sourceService = "media-control",
                source = "Stream Registry",
                message = "송출 종료 감지",
                connections = 1,
                latencyMs = 110,
                throughputMbps = 0.0,
                groupId = group,
                streamId = "raw/local/webcam",
                connectionId = "conn-whep-001",
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

    private fun seedAuthUsers(
        settings: AuthRuntimeSettings,
        passwordHasher: PasswordHasher,
    ): List<AuthUser> =
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
        )
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
    val jdbcPersistenceEnabled: Boolean = true,
    val l1AuthUserCacheEnabled: Boolean = true,
    val redisOperationalEventCacheEnabled: Boolean = true,
    val operationalEventCacheKeyPrefix: String = "gcs:ops-events:",
    val operationalEventCacheTtlSeconds: Long = 5,
    val operationalEventStaleCacheKeyPrefix: String = "gcs:ops-events:stale:",
    val operationalEventStaleCacheTtlSeconds: Long = 60,
    val operationalEventCacheTtlJitterRatio: Double = 0.2,
    val redisOperationalReadCacheEnabled: Boolean = true,
    val operationalReadCacheKeyPrefix: String = "gcs:ops-read:",
    val operationalReadCacheTtlSeconds: Long = 3,
    val operationalReadStaleCacheKeyPrefix: String = "gcs:ops-read:stale:",
    val operationalReadStaleCacheTtlSeconds: Long = 30,
    val operationalReadCacheTtlJitterRatio: Double = 0.2,
    val authRateLimitEnabled: Boolean = true,
    val authRateLimitPerMinute: Int = 60,
    val asyncPostProcessingEnabled: Boolean = true,
    val postProcessingCorePoolSize: Int = 2,
    val postProcessingMaxPoolSize: Int = 4,
    val postProcessingQueueCapacity: Int = 256,
) {
    companion object {
        private const val DEFAULT_SECRET = "local-auth-policy-secret-at-least-32-characters"
        private const val DEFAULT_OPERATOR_PASSWORD = "correct-password"
        private const val DEFAULT_SMOKE_PASSWORD = "m7-smoke-pass"
        private val LOCAL_DEFAULT_PROFILES = setOf("local", "dev", "test")

        fun fromEnvironment(env: Environment): AuthRuntimeSettings =
            AuthRuntimeSettings(
                jwtSecret = requiredSecret(
                    env,
                    listOf("AUTH_POLICY_JWT_SECRET", "AUTH_JWT_SECRET"),
                    DEFAULT_SECRET,
                ),
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
                operatorPassword = requiredSecret(
                    env,
                    listOf("AUTH_POLICY_OPERATOR_PASSWORD"),
                    DEFAULT_OPERATOR_PASSWORD,
                ),
                operatorCompanyId = intEnv(env, "AUTH_POLICY_OPERATOR_COMPANY_ID", 1),
                operatorGroupId = env.getProperty("AUTH_POLICY_OPERATOR_GROUP_ID") ?: "co-a",
                smokeUsername = env.getProperty("AUTH_POLICY_SMOKE_USERNAME") ?: "m7-smoke-viewer",
                smokePassword = requiredSecret(
                    env,
                    listOf("AUTH_POLICY_SMOKE_PASSWORD"),
                    DEFAULT_SMOKE_PASSWORD,
                ),
                smokeCompanyId = intEnv(env, "AUTH_POLICY_SMOKE_COMPANY_ID", 1),
                smokeGroupId = env.getProperty("AUTH_POLICY_SMOKE_GROUP_ID") ?: "co-a",
                signupInvites = signupInvites(env),
                redisPrincipalCacheEnabled = boolEnv(env, "AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED", true),
                redisRefreshSessionEnabled = boolEnv(env, "AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED", true),
                jdbcPersistenceEnabled = boolEnv(env, "AUTH_POLICY_JDBC_PERSISTENCE_ENABLED", true),
                l1AuthUserCacheEnabled = boolEnv(env, "AUTH_POLICY_L1_AUTH_USER_CACHE_ENABLED", true),
                redisOperationalEventCacheEnabled = boolEnv(env, "AUTH_POLICY_REDIS_OPERATIONAL_EVENT_CACHE_ENABLED", true),
                operationalEventCacheKeyPrefix = env.getProperty("AUTH_POLICY_OPERATIONAL_EVENT_CACHE_KEY_PREFIX")
                    ?: "gcs:ops-events:",
                operationalEventCacheTtlSeconds = longEnv(env, "AUTH_POLICY_OPERATIONAL_EVENT_CACHE_TTL_SECONDS", 5),
                operationalEventStaleCacheKeyPrefix = env.getProperty("AUTH_POLICY_OPERATIONAL_EVENT_STALE_CACHE_KEY_PREFIX")
                    ?: "gcs:ops-events:stale:",
                operationalEventStaleCacheTtlSeconds = longEnv(env, "AUTH_POLICY_OPERATIONAL_EVENT_STALE_CACHE_TTL_SECONDS", 60),
                operationalEventCacheTtlJitterRatio = doubleEnv(env, "AUTH_POLICY_OPERATIONAL_EVENT_CACHE_TTL_JITTER_RATIO", 0.2),
                redisOperationalReadCacheEnabled = boolEnv(env, "AUTH_POLICY_REDIS_OPERATIONAL_READ_CACHE_ENABLED", true),
                operationalReadCacheKeyPrefix = env.getProperty("AUTH_POLICY_OPERATIONAL_READ_CACHE_KEY_PREFIX")
                    ?: "gcs:ops-read:",
                operationalReadCacheTtlSeconds = longEnv(env, "AUTH_POLICY_OPERATIONAL_READ_CACHE_TTL_SECONDS", 3),
                operationalReadStaleCacheKeyPrefix = env.getProperty("AUTH_POLICY_OPERATIONAL_READ_STALE_CACHE_KEY_PREFIX")
                    ?: "gcs:ops-read:stale:",
                operationalReadStaleCacheTtlSeconds = longEnv(env, "AUTH_POLICY_OPERATIONAL_READ_STALE_CACHE_TTL_SECONDS", 30),
                operationalReadCacheTtlJitterRatio = doubleEnv(env, "AUTH_POLICY_OPERATIONAL_READ_CACHE_TTL_JITTER_RATIO", 0.2),
                authRateLimitEnabled = boolEnv(env, "AUTH_POLICY_RATE_LIMIT_ENABLED", true),
                authRateLimitPerMinute = intEnv(env, "AUTH_POLICY_AUTH_RATE_LIMIT_PER_MINUTE", 60),
                asyncPostProcessingEnabled = boolEnv(env, "AUTH_POLICY_ASYNC_POST_PROCESSING_ENABLED", true),
                postProcessingCorePoolSize = intEnv(env, "AUTH_POLICY_POST_PROCESSING_CORE_POOL_SIZE", 2),
                postProcessingMaxPoolSize = intEnv(env, "AUTH_POLICY_POST_PROCESSING_MAX_POOL_SIZE", 4),
                postProcessingQueueCapacity = intEnv(env, "AUTH_POLICY_POST_PROCESSING_QUEUE_CAPACITY", 256),
            )

        private fun requiredSecret(env: Environment, names: List<String>, localDefault: String): String {
            val configured = names.asSequence()
                .mapNotNull { env.getProperty(it)?.trim()?.takeIf(String::isNotEmpty) }
                .firstOrNull()
            if (configured != null) {
                return configured
            }
            if (allowsLocalDefaults(env)) {
                return localDefault
            }
            error("Missing required auth-policy secret setting: ${names.joinToString(" or ")}")
        }

        private fun allowsLocalDefaults(env: Environment): Boolean =
            boolEnv(env, "AUTH_POLICY_ALLOW_LOCAL_DEFAULTS", false) ||
                env.activeProfiles.any { it in LOCAL_DEFAULT_PROFILES }

        private fun longEnv(env: Environment, name: String, defaultValue: Long): Long =
            env.getProperty(name)?.toLongOrNull()?.takeIf { it > 0 } ?: defaultValue

        private fun intEnv(env: Environment, name: String, defaultValue: Int): Int =
            env.getProperty(name)?.toIntOrNull()?.takeIf { it > 0 } ?: defaultValue

        private fun boolEnv(env: Environment, name: String, defaultValue: Boolean): Boolean =
            env.getProperty(name)?.lowercase()?.let { it == "true" || it == "1" } ?: defaultValue

        private fun doubleEnv(env: Environment, name: String, defaultValue: Double): Double =
            env.getProperty(name)?.toDoubleOrNull()?.takeIf { it >= 0.0 } ?: defaultValue

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
