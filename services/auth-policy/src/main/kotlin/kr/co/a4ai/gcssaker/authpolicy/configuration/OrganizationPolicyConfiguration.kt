package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupAccessService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

/** Organization hierarchy and group-policy composition. */
@Configuration
class OrganizationPolicyConfiguration {
    @Bean
    fun organizationHierarchyRepository(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): OrganizationHierarchyRepository {
        val seedUnits = seedOrganizationUnits()
        return PersistenceMode.dataSource(settings, dataSource)?.let {
            JdbcOrganizationHierarchyRepository(it, seedUnits)
        } ?: InMemoryOrganizationHierarchyRepository(seedUnits)
    }

    @Bean
    fun groupAccessService(
        hierarchyRepository: OrganizationHierarchyRepository,
        registeredDevices: RegisteredDeviceRepository,
    ): GroupAccessService = GroupAccessService(hierarchyRepository, registeredDevices)

    @Bean
    fun groupPolicyService(hierarchyRepository: OrganizationHierarchyRepository): GroupPolicyService =
        GroupPolicyService(hierarchyRepository)

    @Bean
    fun groupLifecycleService(
        hierarchyRepository: OrganizationHierarchyRepository,
        users: AuthUserRepository,
        registeredDevices: RegisteredDeviceRepository,
        refreshSessionStore: RefreshSessionStore,
    ): GroupLifecycleService = GroupLifecycleService(hierarchyRepository, users, registeredDevices, refreshSessionStore)
}
