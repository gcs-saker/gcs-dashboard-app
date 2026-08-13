package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class SignupRegistrationTokenServiceTest {
    private val repository = InMemorySignupRegistrationTokenRepository()
    private val service = SignupRegistrationTokenService(
        repository = repository,
        passwordHasher = PasswordHasher(),
        clock = Clock.fixed(Instant.parse("2026-07-29T00:00:00Z"), ZoneOffset.UTC),
        idGenerator = { "signup-token-1" },
    )

    @Test
    fun `issued token resolves signup company and group once`() {
        val issued = service.issue(
            SignupRegistrationTokenIssueCommand(
                companyId = 1,
                groupId = "co-a",
                label = "new member",
                ttlMinutes = 60,
                maxUses = 1,
                createdBy = "admin01",
            ),
        )

        val invite = service.findByCode(issued.token)

        assertNotNull(invite)
        assertEquals(1, invite?.companyId)
        assertEquals("co-a", invite?.groupId?.value)
        assertEquals(UserRole.VIEWER, invite?.role)
        assertNull(service.findByCode(issued.token))
        assertEquals(1, service.list().single().usedCount)
    }

    @Test
    fun `operator token assigns operator role to signup invite`() {
        val issued = service.issue(
            SignupRegistrationTokenIssueCommand(
                companyId = 1,
                groupId = "co-a",
                label = "mobile publisher",
                ttlMinutes = 60,
                maxUses = 1,
                createdBy = "admin01",
                role = UserRole.OPERATOR,
            ),
        )

        assertEquals(UserRole.OPERATOR, service.findByCode(issued.token)?.role)
    }

    @Test
    fun `admin role cannot be delegated through signup token`() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException::class.java) {
            service.issue(
                SignupRegistrationTokenIssueCommand(1, "co-a", "admin", 60, 1, "admin01", UserRole.ADMIN),
            )
        }
    }

    @Test
    fun `invalid token does not consume active token`() {
        service.issue(
            SignupRegistrationTokenIssueCommand(1, "co-a", "new member", 60, 1, "admin01"),
        )

        assertNull(service.findByCode("wrong-token"))
        assertEquals(0, service.list().single().usedCount)
    }
}
