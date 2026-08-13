package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogger
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OperationalAuditConfiguration {
    @Bean
    fun settingsAuditPublisher(repository: OperationalEventRepository): SettingsAuditPublisher =
        RepositorySettingsAuditPublisher(repository)

    @Bean
    fun securityAuditPublisher(repository: OperationalEventRepository): SecurityAuditPublisher =
        RepositorySecurityAuditPublisher(repository)

    @Bean
    fun operationalFailureLogger(repository: OperationalEventRepository): OperationalFailureLoggerFacade =
        OperationalFailureLogger(repository)
}
