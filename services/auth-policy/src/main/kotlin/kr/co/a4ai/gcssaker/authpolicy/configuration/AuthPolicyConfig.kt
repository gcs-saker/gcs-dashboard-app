package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CachedAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CompositeSignupInviteResolver
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemorySignupRegistrationTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcSignupRegistrationTokenRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import java.time.Duration
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
        val repository = PersistenceMode.dataSource(settings, dataSource)?.let {
            JdbcAuthUserRepository(it, initialUsers)
        } ?: run {
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
    fun authRegistrationService(
        users: AuthUserRepository,
        passwordHasher: PasswordHasher,
        settings: AuthRuntimeSettings,
        signupRegistrationTokens: SignupRegistrationTokenService,
    ): AuthRegistrationService =
        AuthRegistrationService(
            users,
            passwordHasher,
            CompositeSignupInviteResolver(settings.signupInvites, signupRegistrationTokens),
        )

    @Bean
    fun signupRegistrationTokenRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): SignupRegistrationTokenRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcSignupRegistrationTokenRepository)
            ?: run {
            InMemorySignupRegistrationTokenRepository()
        }

    @Bean
    fun signupRegistrationTokenService(
        repository: SignupRegistrationTokenRepository,
        passwordHasher: PasswordHasher,
        hierarchyRepository: OrganizationHierarchyRepository,
    ): SignupRegistrationTokenService =
        SignupRegistrationTokenService(repository, passwordHasher, hierarchyRepository)

    @Bean
    fun organizationHierarchyRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): OrganizationHierarchyRepository {
        val seedUnits = seedOrganizationUnits()
        return PersistenceMode.dataSource(settings, dataSource)?.let {
            JdbcOrganizationHierarchyRepository(it, seedUnits)
        } ?: run {
            InMemoryOrganizationHierarchyRepository(seedUnits)
        }
    }

    @Bean
    fun groupPolicyService(hierarchyRepository: OrganizationHierarchyRepository): GroupPolicyService =
        GroupPolicyService(hierarchyRepository.current().units())

    @Bean
    fun registeredDeviceRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): RegisteredDeviceRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcRegisteredDeviceRepository)
            ?: run {
            InMemoryRegisteredDeviceRepository()
        }

    @Bean
    fun deviceCredentialAuthenticationService(
        devices: RegisteredDeviceRepository,
        passwordHasher: PasswordHasher,
    ): DeviceCredentialAuthenticationService =
        DeviceCredentialAuthenticationService(devices, passwordHasher)

    @Bean
    fun devicePublishAuthorizationService(
        deviceCredentials: DeviceCredentialAuthenticationService,
    ): DevicePublishAuthorizationService =
        DevicePublishAuthorizationService(deviceCredentials)

    @Bean
    fun deviceLifecycleService(
        devices: RegisteredDeviceRepository,
        passwordHasher: PasswordHasher,
    ): DeviceLifecycleService =
        DeviceLifecycleService(devices, passwordHasher)

    @Bean
    fun deviceProvisioningTokenRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): DeviceProvisioningTokenRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcDeviceProvisioningTokenRepository)
            ?: run {
            InMemoryDeviceProvisioningTokenRepository()
        }

    @Bean
    fun deviceProvisioningTokenService(
        tokens: DeviceProvisioningTokenRepository,
        passwordHasher: PasswordHasher,
        hierarchyRepository: OrganizationHierarchyRepository,
    ): DeviceProvisioningTokenService =
        DeviceProvisioningTokenService(tokens, passwordHasher, hierarchyRepository)

    @Bean
    fun deviceBootstrapService(
        lifecycle: DeviceLifecycleService,
        settings: AuthRuntimeSettings,
        provisioningTokens: DeviceProvisioningTokenService,
    ): DeviceBootstrapService =
        DeviceBootstrapService(lifecycle, settings.deviceBootstrapTokens, provisioningTokens)

    @Bean
    fun timeSyncConfigRepository(env: Environment): TimeSyncConfigRepository =
        timeSyncConfigRepositoryFromEnvironment(env)

    @Bean
    fun timeSyncStatusService(repository: TimeSyncConfigRepository): TimeSyncStatusService =
        TimeSyncStatusService(repository)

}
