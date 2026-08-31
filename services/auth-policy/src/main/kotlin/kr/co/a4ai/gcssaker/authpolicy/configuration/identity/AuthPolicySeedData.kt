package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole

internal fun seedAuthUsers(
    settings: AuthRuntimeSettings,
    passwordHasher: PasswordHasher,
): List<AuthUser> =
    listOf(
        AuthUser(
            id = 100,
            username = settings.adminUsername,
            email = "${settings.adminUsername}@example.test",
            passwordHash = passwordHasher.hash(settings.adminPassword),
            companyId = settings.adminCompanyId,
            role = UserRole.ADMIN,
            groupId = GroupId(settings.adminGroupId),
        ),
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

internal fun seedOrganizationUnits(): List<OrganizationUnit> =
    listOf(
        OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION),
        OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
        OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, GroupId("bn-1")),
        OrganizationUnit(GroupId("plt-b-1"), "B Company 1 Platoon", GroupType.PLATOON, GroupId("co-b")),
    )
