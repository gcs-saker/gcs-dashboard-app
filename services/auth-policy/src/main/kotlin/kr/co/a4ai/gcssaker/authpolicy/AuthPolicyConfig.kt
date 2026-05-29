package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import java.time.Duration

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
                    username = settings.operatorUsername,
                    email = "${settings.operatorUsername}@example.test",
                    passwordHash = passwordHasher.hash(settings.operatorPassword),
                    role = UserRole.OPERATOR,
                    groupId = GroupId(settings.operatorGroupId),
                ),
                AuthUser(
                    username = settings.smokeUsername,
                    email = "${settings.smokeUsername}@example.test",
                    passwordHash = passwordHasher.hash(settings.smokePassword),
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
    ): AuthSessionService =
        AuthSessionService(users, passwordHasher, tokenService)

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
}

data class AuthRuntimeSettings(
    val jwtSecret: String,
    val jwtIssuer: String,
    val accessTokenExpireMinutes: Long,
    val refreshTokenExpireMinutes: Long,
    val refreshCookieName: String,
    val refreshCookieSecure: Boolean,
    val refreshCookieSameSite: String,
    val allowedOrigins: Set<String>,
    val operatorUsername: String,
    val operatorPassword: String,
    val operatorGroupId: String,
    val smokeUsername: String,
    val smokePassword: String,
    val smokeGroupId: String,
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
                allowedOrigins = csvEnv(env, "AUTH_POLICY_ALLOWED_ORIGINS")
                    .ifEmpty { csvEnv(env, "BACKEND_CORS_ALLOW_ORIGINS") },
                operatorUsername = env.getProperty("AUTH_POLICY_OPERATOR_USERNAME") ?: "operator01",
                operatorPassword = env.getProperty("AUTH_POLICY_OPERATOR_PASSWORD") ?: "correct-password",
                operatorGroupId = env.getProperty("AUTH_POLICY_OPERATOR_GROUP_ID") ?: "co-a",
                smokeUsername = env.getProperty("AUTH_POLICY_SMOKE_USERNAME") ?: "m7-smoke-viewer",
                smokePassword = env.getProperty("AUTH_POLICY_SMOKE_PASSWORD") ?: "m7-smoke-pass",
                smokeGroupId = env.getProperty("AUTH_POLICY_SMOKE_GROUP_ID") ?: "co-a",
            )

        private fun longEnv(env: Environment, name: String, defaultValue: Long): Long =
            env.getProperty(name)?.toLongOrNull()?.takeIf { it > 0 } ?: defaultValue

        private fun boolEnv(env: Environment, name: String, defaultValue: Boolean): Boolean =
            env.getProperty(name)?.lowercase()?.let { it == "true" || it == "1" } ?: defaultValue

        private fun csvEnv(env: Environment, name: String): Set<String> =
            env.getProperty(name)
                ?.split(",")
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
                ?.toSet()
                ?: emptySet()
    }
}
