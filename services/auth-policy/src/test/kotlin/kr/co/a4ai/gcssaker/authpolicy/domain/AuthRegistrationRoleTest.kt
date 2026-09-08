package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AuthRegistrationRoleTest {
    @Test
    fun `signup receives the role delegated by its invite`() {
        val users = InMemoryAuthUserRepository(emptyList())
        val registration = AuthRegistrationService(
            users,
            PasswordHasher(),
            SignupInvites.of(listOf(SignupInvite("operator-token", 1, GroupId("co-a"), UserRole.OPERATOR))),
        )

        val user = registration.signup(
            SignupCommand("mobile-operator", "mobile@example.test", "password", "operator-token"),
        )

        assertEquals(UserRole.OPERATOR, user.role)
        assertEquals(UserRole.OPERATOR, users.findByUsername("mobile-operator")?.role)
    }
}
