package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationService
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcRegisteredDeviceRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

/** Device identity, lifecycle, and provisioning composition. */
@Configuration
class DevicePolicyConfiguration {
    @Bean
    fun registeredDeviceRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): RegisteredDeviceRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcRegisteredDeviceRepository)
            ?: InMemoryRegisteredDeviceRepository()

    @Bean
    fun deviceCredentialAuthenticationService(
        devices: RegisteredDeviceRepository,
        passwordHasher: PasswordHasher,
    ): DeviceCredentialAuthenticationService = DeviceCredentialAuthenticationService(devices, passwordHasher)

    @Bean
    fun devicePublishAuthorizationService(
        deviceCredentials: DeviceCredentialAuthenticationService,
    ): DevicePublishAuthorizationService = DevicePublishAuthorizationService(deviceCredentials)

    @Bean
    fun deviceLifecycleService(
        devices: RegisteredDeviceRepository,
        passwordHasher: PasswordHasher,
    ): DeviceLifecycleService = DeviceLifecycleService(devices, passwordHasher)

    @Bean
    fun deviceProvisioningTokenRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): DeviceProvisioningTokenRepository =
        PersistenceMode.dataSource(settings, dataSource)?.let(::JdbcDeviceProvisioningTokenRepository)
            ?: InMemoryDeviceProvisioningTokenRepository()

    @Bean
    fun deviceProvisioningTokenService(
        tokens: DeviceProvisioningTokenRepository,
        passwordHasher: PasswordHasher,
        hierarchyRepository: OrganizationHierarchyRepository,
    ): DeviceProvisioningTokenService = DeviceProvisioningTokenService(tokens, passwordHasher, hierarchyRepository)

    @Bean
    fun deviceBootstrapService(
        lifecycle: DeviceLifecycleService,
        settings: AuthRuntimeSettings,
        provisioningTokens: DeviceProvisioningTokenService,
    ): DeviceBootstrapService = DeviceBootstrapService(lifecycle, settings.deviceBootstrapTokens, provisioningTokens)
}
