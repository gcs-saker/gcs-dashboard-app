package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CompositeSignupInviteResolver
import kr.co.a4ai.gcssaker.authpolicy.domain.DirectSignupTransactionBoundary
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemorySignupRegistrationTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupTransactionBoundary
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcSignupRegistrationTokenRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

/** Signup invitation, token, and transaction-boundary composition. */
@Configuration
class SignupPolicyConfiguration {
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
            ?: InMemorySignupRegistrationTokenRepository()

    @Bean
    fun signupRegistrationTokenService(
        repository: SignupRegistrationTokenRepository,
        passwordHasher: PasswordHasher,
        hierarchyRepository: OrganizationHierarchyRepository,
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): SignupRegistrationTokenService =
        SignupRegistrationTokenService(
            repository = repository,
            passwordHasher = passwordHasher,
            hierarchyRepository = hierarchyRepository,
            transactionBoundary = signupTransactionBoundary(settings, dataSource),
        )

    private fun signupTransactionBoundary(
        settings: AuthRuntimeSettings,
        dataSource: ObjectProvider<DataSource>,
    ): SignupTransactionBoundary =
        PersistenceMode.dataSource(settings, dataSource)?.let { source ->
            val transactions = TransactionTemplate(DataSourceTransactionManager(source))
            object : SignupTransactionBoundary {
                override fun <T> execute(action: () -> T): T =
                    transactions.execute { action() } ?: error("signup transaction returned no result")
            }
        } ?: DirectSignupTransactionBoundary
}
