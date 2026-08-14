package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CachedAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupMemberAdministrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuthUserRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import java.time.Duration
import javax.sql.DataSource

/** Authentication identity and session composition only. */
@Configuration
class AuthPolicyConfig {
    @Bean
    fun authRuntimeSettings(env: Environment): AuthRuntimeSettings = AuthRuntimeSettings.fromEnvironment(env)

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
        val repository = PersistenceMode.dataSource(settings, dataSource)?.let {
            JdbcAuthUserRepository(it, initialUsers)
        } ?: InMemoryAuthUserRepository(initialUsers)
        return if (settings.l1AuthUserCacheEnabled) CachedAuthUserRepository(repository) else repository
    }

    @Bean
    fun authSessionService(
        users: AuthUserRepository,
        passwordHasher: PasswordHasher,
        tokenService: JwtTokenService,
        principalCache: PrincipalCache,
        refreshSessionStore: RefreshSessionStore,
    ): AuthSessionService = AuthSessionService(users, passwordHasher, tokenService, principalCache, refreshSessionStore)

    @Bean
    fun groupMemberAdministrationService(
        users: AuthUserRepository,
        passwordHasher: PasswordHasher,
        refreshSessionStore: RefreshSessionStore,
    ): GroupMemberAdministrationService = GroupMemberAdministrationService(
        users, passwordHasher, refreshSessions = refreshSessionStore,
    )
}
