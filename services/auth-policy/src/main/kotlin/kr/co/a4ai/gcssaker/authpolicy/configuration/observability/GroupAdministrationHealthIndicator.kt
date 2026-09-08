package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.boot.actuate.health.Health
import org.springframework.boot.actuate.health.HealthIndicator
import org.springframework.stereotype.Component

@Component
class GroupAdministrationHealthIndicator(
    private val groups: OrganizationHierarchyRepository,
    private val users: AuthUserRepository,
) : HealthIndicator {
    override fun health(): Health {
        val activeAdministratorCounts = users.list()
            .filter { it.active && it.role == UserRole.GROUP_ADMIN }
            .groupingBy { it.groupId }
            .eachCount()
        val uncoveredGroups = groups.listAll()
            .filter { it.status == GroupStatus.ACTIVE }
            .filter { activeAdministratorCounts[it.id] != 1 }
            .map { it.id.value }
            .sorted()
        return Health.up()
            .withDetail("policy", "exactly_one_active_group_admin")
            .withDetail("coverage", if (uncoveredGroups.isEmpty()) "complete" else "warning")
            .withDetail("uncoveredGroupCount", uncoveredGroups.size)
            .withDetail("uncoveredGroups", uncoveredGroups)
            .build()
    }
}
